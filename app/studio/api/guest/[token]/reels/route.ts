import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { randomUUID } from 'crypto'
import { studioGetItem, studioPutItem, TABLES } from '@/lib/studio/dynamodb'
import { getStudioR2SignedViewUrl } from '@/lib/studio/r2'
import { checkReelCreditsAvailable } from '@/lib/studio/quota'
import { deductReelCredits, refundReelCredits, grantFreeTrialReelCreditsIfNeeded } from '@/lib/studio/billing'
import { createReelClipTasks } from '@/lib/studio/videoProviders'
import {
  computeReelCost, MIN_REEL_PHOTOS, MAX_REEL_PHOTOS, MAX_REEL_TOTAL_DURATION_SEC, REEL_RESOLUTIONS, DEFAULT_REEL_RESOLUTION,
  REEL_CLIP_DURATION_OPTIONS, DEFAULT_AI_CLIP_DURATION_SEC,
  REEL_STYLES, REEL_STYLE_META, getReelTemplate, DEFAULT_REEL_TEMPLATE, MAX_CUSTOM_PROMPT_LENGTH,
  DRONE_SHOT_STYLES, DRONE_SHOT_META,
} from '@/constants/videoProviders'
import { getPricingConfig } from '@/lib/pricingConfig'
import type { MediaFile, Studio, StudioJob, StudioReel, ReelStyle, ReelResolution, ReelMotion } from '@/types/studio'

function getSecret() {
  return new TextEncoder().encode(process.env.STUDIO_JWT_SECRET!)
}

// Guest-side AI Reel creation — GUEST_QR JWT only, no cookie/session. The
// hard requirement from the design doc (§5): a guest must NEVER be able to
// build a reel from arbitrary project photos, only from photos their own
// selfie search actually matched. Client-supplied photoIds are validated
// against the persisted SELFIE_SEARCH session job (search/route.ts), not
// trusted directly — this is the actual trust-boundary fix, everything
// else mirrors the client-gallery reel route's mechanics.
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    let projectId: string
    let studioId: string
    try {
      const { payload } = await jwtVerify(params.token, getSecret())
      if (payload.type !== 'GUEST_QR') {
        return NextResponse.json({ success: false, error: 'INVALID_TOKEN' }, { status: 401 })
      }
      projectId = payload.projectId as string
      studioId = payload.studioId as string
    } catch (err: unknown) {
      const name = (err as { name?: string }).name ?? ''
      if (name === 'JWTExpired') return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
      return NextResponse.json({ success: false, error: 'INVALID_TOKEN' }, { status: 401 })
    }

    const { photoIds, searchSessionId, templateId, style, customPrompt, resolution: requestedResolution, durationSec: requestedDurationSec, droneShot: requestedDroneShot } = await req.json().catch(() => ({})) as {
      photoIds?: string[]; searchSessionId?: string; templateId?: string; style?: string; customPrompt?: string; resolution?: string; durationSec?: number; droneShot?: string
    }
    const resolution: ReelResolution = (REEL_RESOLUTIONS as readonly string[]).includes(requestedResolution ?? '')
      ? (requestedResolution as ReelResolution)
      : DEFAULT_REEL_RESOLUTION
    const durationSec = (REEL_CLIP_DURATION_OPTIONS as readonly number[]).includes(requestedDurationSec ?? -1)
      ? (requestedDurationSec as number)
      : DEFAULT_AI_CLIP_DURATION_SEC
    const droneFragment = requestedDroneShot && (DRONE_SHOT_STYLES as readonly string[]).includes(requestedDroneShot)
      ? DRONE_SHOT_META[requestedDroneShot as (typeof DRONE_SHOT_STYLES)[number]].promptFragment
      : null
    if (!Array.isArray(photoIds) || photoIds.length < MIN_REEL_PHOTOS) {
      return NextResponse.json({ success: false, error: 'INVALID_PHOTO_COUNT', message: 'Select at least 1 photo.' }, { status: 400 })
    }
    if (photoIds.length > MAX_REEL_PHOTOS) {
      return NextResponse.json({ success: false, error: 'TOO_MANY_PHOTOS', message: `You can select up to ${MAX_REEL_PHOTOS} photos per reel.` }, { status: 400 })
    }
    if (photoIds.length * durationSec > MAX_REEL_TOTAL_DURATION_SEC) {
      return NextResponse.json({
        success: false, error: 'REEL_TOO_LONG',
        message: `This reel would be ${photoIds.length * durationSec}s long — the max is ${MAX_REEL_TOTAL_DURATION_SEC}s. Pick fewer photos or a shorter clip length.`,
      }, { status: 400 })
    }
    if (!searchSessionId) {
      return NextResponse.json({ success: false, error: 'MISSING_SEARCH_SESSION' }, { status: 400 })
    }

    // THE trust-boundary check — the search session record is the only
    // source of truth for "which photos did this guest's own face actually
    // match." A missing/wrong-project/non-selfie-search job means either an
    // expired session (2h TTL) or a tampered/foreign id — both rejected the
    // same way, no information leaked about which.
    const searchJob = await studioGetItem<StudioJob>(TABLES.jobs, { jobId: searchSessionId })
    if (!searchJob || searchJob.jobType !== 'SELFIE_SEARCH' || searchJob.projectId !== projectId || searchJob.studioId !== studioId) {
      return NextResponse.json({ success: false, error: 'SEARCH_SESSION_EXPIRED', message: 'Your search session has expired — please search again.' }, { status: 410 })
    }
    const matchedFileIds = new Set((searchJob.outputPayload?.matchedFileIds as string[] | undefined) ?? [])
    const requestedSet = new Set(photoIds)
    const notMatched = photoIds.filter((id) => !matchedFileIds.has(id))
    if (notMatched.length > 0) {
      // Never trust client-supplied photoIds beyond this check — silently
      // rejecting the whole request (rather than filtering and continuing)
      // is deliberate: a mismatch here means either a stale UI or a
      // tampered request, neither of which should partially succeed.
      return NextResponse.json({ success: false, error: 'PHOTOS_NOT_IN_SEARCH', message: 'One or more selected photos were not part of your search results.' }, { status: 403 })
    }

    const template = getReelTemplate(templateId ?? DEFAULT_REEL_TEMPLATE)
    if (!template) return NextResponse.json({ success: false, error: 'INVALID_TEMPLATE' }, { status: 400 })
    const reelStyle = (REEL_STYLES as readonly string[]).includes(style ?? '') ? (style as ReelStyle) : 'CINEMATIC'
    const sanitizedPrompt = typeof customPrompt === 'string' ? customPrompt.trim().slice(0, MAX_CUSTOM_PROMPT_LENGTH) : ''

    const allFiles = await Promise.all(
      Array.from(requestedSet).map((fileId) => studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId }))
    )
    // fileType === 'IMAGE' is load-bearing — the Lambda calls Kling's
    // image-to-video endpoint, passing each file's URL as the still
    // "first_frame" to animate. It has no video-input capability at all, so
    // without this filter a selected video's URL was passed straight
    // through as if it were a photo, wasting a real paid Kling API call.
    const selectedFiles = allFiles.filter((f): f is MediaFile => !!f && f.processingStatus === 'READY' && f.fileType === 'IMAGE')
    if (selectedFiles.length !== photoIds.length) {
      return NextResponse.json({ success: false, error: 'INVALID_PHOTOS', message: 'Only photos can be used for AI Reels — videos aren\'t supported as an input.' }, { status: 400 })
    }

    const photos = selectedFiles.map((f) => ({ fileId: f.fileId, filename: f.originalFilename, key: f.editedR2Key || f.r2Key }))
    if (photos.find((p) => !p.key)) {
      return NextResponse.json({ success: false, error: 'UNSUPPORTED_PHOTO', message: 'One or more selected photos are not eligible for AI Reel generation yet.' }, { status: 400 })
    }

    let studio = await studioGetItem<Studio>(TABLES.studios, { studioId })
    if (!studio) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    studio = await grantFreeTrialReelCreditsIfNeeded(studio)

    const pricing = await getPricingConfig()
    const { creditsRequired } = computeReelCost(photos.length, durationSec, resolution, pricing)
    const creditCheck = checkReelCreditsAvailable(studio, creditsRequired)
    if (!creditCheck.ok) {
      return NextResponse.json({
        success: false, error: 'INSUFFICIENT_CREDITS',
        message: 'This studio does not have enough AI Reel credits right now — ask your photographer to top up.',
      }, { status: 402 })
    }

    if (!process.env.REEL_LAMBDA_ARN) {
      console.error('[guest reels POST] REEL_LAMBDA_ARN not set')
      return NextResponse.json({ success: false, error: 'NOT_CONFIGURED' }, { status: 503 })
    }

    await deductReelCredits(studioId, creditsRequired)

    const reelId = randomUUID()
    const jobId = randomUUID()
    const now = new Date().toISOString()
    const ttl = Math.floor(Date.now() / 1000) + 24 * 60 * 60

    // Async-redesign (Phase 3, mirrors Phase 2's Client Gallery migration —
    // see reelgen-async-redesign-plan-2026-09 in memory): Kling task
    // creation happens HERE, in the route, instead of inside the reelgen
    // Lambda. The Lambda is only invoked later, by
    // app/studio/api/cron/reel-check's periodic poll (jobType-agnostic,
    // needed no changes for this migration), once every clip is already
    // known to have succeeded (mode: 'finalize').
    const stylePromptFragment = [sanitizedPrompt || null, REEL_STYLE_META[reelStyle].promptFragment, droneFragment]
      .filter(Boolean).join(', ')

    // Credits are already deducted above — everything through task creation
    // must refund on ANY failure, not just "some clips failed" below. A
    // synchronous throw (no provider configured, or a presigned-URL mint
    // failing) would otherwise bypass that check and leak the deduction —
    // same fix Phase 2's Client Gallery route needed.
    let created: Awaited<ReturnType<typeof createReelClipTasks>>
    try {
      const clipsForKling = await Promise.all(photos.map(async (p) => ({
        photoId: p.fileId,
        imageUrl: await getStudioR2SignedViewUrl(p.key!),
        prompt: stylePromptFragment,
        // Not actually sent to Kling (see klingProvider.ts's real confirmed
        // request body) — required by the ImageToVideoRequest interface only.
        motion: 'slow_push_in' as ReelMotion,
      })))

      created = await createReelClipTasks({
        reelId, style: reelStyle, clips: clipsForKling,
        durationSec, aspectRatio: template.aspectRatio, resolution,
      })
    } catch (err) {
      await refundReelCredits(studioId, creditsRequired)
      console.error('[guest reels POST] Kling task creation threw before any clip could be created', err)
      return NextResponse.json({ success: false, error: 'GENERATION_FAILED', message: 'Could not start generation — please try again.' }, { status: 502 })
    }

    // MVP: a partial batch fails the whole reel rather than silently
    // dropping photos or leaving orphaned, untracked Kling tasks running —
    // same scope cut as Client Gallery's Phase 2 migration.
    if (created.failed.length > 0) {
      await refundReelCredits(studioId, creditsRequired)
      console.error('[guest reels POST] Kling task creation failed for one or more photos', created.failed)
      return NextResponse.json({ success: false, error: 'GENERATION_FAILED', message: 'Could not start generation — please try again.' }, { status: 502 })
    }

    const reel: StudioReel = {
      reelId, jobId, studioId, projectId,
      source: 'GUEST_SELFIE_SEARCH',
      guestJwtProjectId: projectId,
      photoIds: selectedFiles.map((f) => f.fileId),
      style: reelStyle,
      templateId: template.id,
      aspectRatio: template.aspectRatio,
      resolution,
      durationSec: durationSec * photos.length,
      customPrompt: sanitizedPrompt || undefined,
      droneShot: droneFragment ? requestedDroneShot : undefined,
      status: 'generating',
      provider: created.provider,
      // Ordered identically to photoIds/clipsForKling (see the same comment
      // on Client Gallery's route.ts) — reel-check relies on this order.
      providerJobIds: created.succeeded.map((s) => s.providerJobId),
      creditsCharged: creditsRequired,
      createdAt: now,
    }
    await studioPutItem(TABLES.reels, reel as unknown as Record<string, unknown>)

    const job: StudioJob = {
      jobId, jobType: 'AI_REEL',
      // PROCESSING, not PENDING — Kling tasks are already live as of this
      // request, no Lambda invocation is pending. reel-check finds this via
      // the jobType-status-index GSI.
      status: 'PROCESSING',
      projectId, studioId,
      inputPayload: { reelId, photoCount: photos.length, source: 'GUEST_SELFIE_SEARCH' },
      outputPayload: { stage: 'generating', processed: 0, total: photos.length },
      createdAt: now, ttl,
    }
    await studioPutItem(TABLES.jobs, job as unknown as Record<string, unknown>)

    return NextResponse.json({ success: true, data: { reelId, jobId, creditsCharged: creditsRequired } })
  } catch (err) {
    console.error('[guest reels POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
