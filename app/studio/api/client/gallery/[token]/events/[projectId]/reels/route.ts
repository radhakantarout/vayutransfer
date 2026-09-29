import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByIndex, studioQueryByPK, studioGetItem, studioPutItem, TABLES } from '@/lib/studio/dynamodb'
import { getStudioR2SignedDownloadUrl, getStudioR2SignedViewUrl } from '@/lib/studio/r2'
import { checkReelCreditsAvailable } from '@/lib/studio/quota'
import { deductReelCredits, refundReelCredits, grantFreeTrialReelCreditsIfNeeded } from '@/lib/studio/billing'
import { createReelClipTasks, createOmniVideoTask, type OmniReferenceInput } from '@/lib/studio/videoProviders'
import {
  computeReelCost, computeOmniVideoCost, MIN_REEL_PHOTOS, MAX_REEL_PHOTOS, MAX_REEL_TOTAL_DURATION_SEC, REEL_RESOLUTIONS, DEFAULT_REEL_RESOLUTION,
  REEL_CLIP_DURATION_OPTIONS, DEFAULT_AI_CLIP_DURATION_SEC,
  REEL_STYLES, REEL_STYLE_META, getReelTemplate, DEFAULT_REEL_TEMPLATE, MAX_CUSTOM_PROMPT_LENGTH,
  DRONE_SHOT_STYLES, DRONE_SHOT_META,
  OMNI_RESOLUTIONS, DEFAULT_OMNI_RESOLUTION, OMNI_MAX_REFERENCE_IMAGES, MIN_TEXT_PROMPT_LENGTH,
  TEXT_TO_VIDEO_ASPECT_RATIOS, DEFAULT_TEXT_TO_VIDEO_ASPECT_RATIO,
} from '@/constants/videoProviders'
import { getPricingConfig } from '@/lib/pricingConfig'
import type { StudioProject, MediaFile, Studio, StudioJob, StudioReel, ReelStyle, ReelResolution, ReelMotion } from '@/types/studio'

// "My Reels" history for one event — lists every reel ever generated for
// this project, newest first, via the projectId-createdAt-index GSI
// (provisioned in Phase 0 specifically for this). outputUrl is minted fresh
// per completed reel on every call, same reasoning as the status route:
// never persist a presigned URL, the underlying object outlives any single
// link's expiry.
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string; projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth) return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 })

    const { token, projectId } = params

    const entryProjects = await studioQueryByIndex<StudioProject>(
      TABLES.projects, 'clientShareToken-index', 'clientShareToken = :token', { ':token': token }
    )
    const entry = entryProjects[0]
    const isClient = auth.role === 'CLIENT' && auth.projectId === entry?.projectId
    const isStudioPreview = !!entry && ['ADMIN', 'OWNER'].includes(auth.role) && auth.studioId === entry.studioId
    if (!entry || (!isClient && !isStudioPreview)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    if (!entry.clientShareExpiresAt || new Date(entry.clientShareExpiresAt) < new Date()) {
      return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
    }

    // Same cross-project ownership check as POST — a client's token only
    // proves who they are, not which project they're allowed to browse;
    // re-verify this specific project belongs to the same client email.
    const project = await studioGetItem<StudioProject>(TABLES.projects, { studioId: entry.studioId, projectId })
    if (!project || project.clientEmail !== entry.clientEmail) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const reels = await studioQueryByIndex<StudioReel>(
      TABLES.reels, 'projectId-createdAt-index', 'projectId = :p', { ':p': projectId }
    )
    reels.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))

    const data = await Promise.all(reels.map(async (r) => ({
      reelId: r.reelId,
      status: r.status,
      photoCount: r.photoIds?.length ?? 0,
      durationSec: r.durationSec,
      style: r.style,
      templateId: r.templateId ?? null,
      creditsCharged: r.creditsCharged ?? 0,
      createdAt: r.createdAt,
      completedAt: r.completedAt ?? null,
      errorMessage: r.errorMessage ?? null,
      outputUrl: r.status === 'completed' && r.outputR2Key
        ? await getStudioR2SignedDownloadUrl(r.outputR2Key, `reel-${r.reelId}.mp4`, 3600)
        : null,
    })))

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[client reels GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

// MVP ("fast minimal demo" path, design doc Phase 1): every selected photo
// becomes one Kling AI clip — no hybrid hero-clip selection, no story
// planning, no style/format choice yet. Client Gallery only; the guest
// selfie-search trust-boundary work (design doc §5) is not needed here.
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string; projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth) return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 })

    const { token, projectId } = params

    const entryProjects = await studioQueryByIndex<StudioProject>(
      TABLES.projects, 'clientShareToken-index', 'clientShareToken = :token', { ':token': token }
    )
    const entry = entryProjects[0]
    const isClient = auth.role === 'CLIENT' && auth.projectId === entry?.projectId
    const isStudioPreview = !!entry && ['ADMIN', 'OWNER'].includes(auth.role) && auth.studioId === entry.studioId
    if (!entry || (!isClient && !isStudioPreview)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    if (!entry.clientShareExpiresAt || new Date(entry.clientShareExpiresAt) < new Date()) {
      return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
    }

    const project = await studioGetItem<StudioProject>(TABLES.projects, { studioId: entry.studioId, projectId })
    if (!project || project.clientEmail !== entry.clientEmail) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const {
      mode: requestedMode, photoIds, templateId, style, customPrompt, resolution: requestedResolution, durationSec: requestedDurationSec, droneShot: requestedDroneShot,
      prompt: omniPrompt, generateAudio: requestedGenerateAudio, aspectRatio: requestedAspectRatio,
    } = await req.json().catch(() => ({})) as {
      mode?: string; photoIds?: string[]; templateId?: string; style?: string; customPrompt?: string; resolution?: string; durationSec?: number; droneShot?: string
      prompt?: string; generateAudio?: boolean; aspectRatio?: string
    }

    // ─── Kling 3.0 Omni — reel-generator-omni-redesign plan, 2026-09-29 ────
    // Client Gallery has no separate reference-upload pipeline (that's a
    // Moments-only addition, Phase 2 of the plan) — the natural fit here is
    // reusing the client's EXISTING selected gallery photos as auto-tagged
    // image references (image_1, image_2, ... in selection order) in ONE
    // Omni call, instead of today's one-Kling-call-per-photo pipeline. No
    // video/audio reference support for Client Gallery in this pass (would
    // need its own upload pipeline) — image-only Omni is still a real
    // upgrade: genuine multi-photo consistency in one call, native audio,
    // real aspect-ratio control, 4K.
    if (requestedMode === 'omni') {
      const sanitizedPrompt = typeof omniPrompt === 'string' ? omniPrompt.trim().slice(0, MAX_CUSTOM_PROMPT_LENGTH) : ''
      if (sanitizedPrompt.length < MIN_TEXT_PROMPT_LENGTH) {
        return NextResponse.json({ success: false, error: 'MISSING_PROMPT', message: `Describe the video you want to generate (at least ${MIN_TEXT_PROMPT_LENGTH} characters).` }, { status: 400 })
      }
      if (!Array.isArray(photoIds) || photoIds.length < MIN_REEL_PHOTOS) {
        return NextResponse.json({ success: false, error: 'INVALID_PHOTO_COUNT', message: 'Select at least 1 photo.' }, { status: 400 })
      }
      if (photoIds.length > OMNI_MAX_REFERENCE_IMAGES) {
        return NextResponse.json({ success: false, error: 'TOO_MANY_PHOTOS', message: `You can use up to ${OMNI_MAX_REFERENCE_IMAGES} photos.` }, { status: 400 })
      }
      const generateAudio = !!requestedGenerateAudio

      const allFiles = await studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', projectId)
      const requestedSet = new Set(photoIds)
      const selectedFiles = allFiles.filter((f) => requestedSet.has(f.fileId) && f.processingStatus === 'READY' && f.fileType === 'IMAGE')
      if (selectedFiles.length !== photoIds.length) {
        return NextResponse.json({ success: false, error: 'INVALID_PHOTOS', message: 'Only photos can be used for AI Reels.' }, { status: 400 })
      }
      // Preserve the client's own selection order — becomes the tag order
      // (image_1 = photoIds[0], etc.) so "the first person" in a prompt
      // maps predictably to the first photo they picked.
      const orderedFiles = photoIds.map((id) => selectedFiles.find((f) => f.fileId === id)!).filter(Boolean)
      const tags = orderedFiles.map((_, i) => `image_${i + 1}`)
      const autoPrompt = tags.length === sanitizedPrompt.split('<<<').length - 1
        ? sanitizedPrompt // client already inserted tags itself (future UI)
        : `${sanitizedPrompt} ${tags.map((t) => `<<<${t}>>>`).join(' ')}`.trim()

      const references: (OmniReferenceInput & { r2Key: string })[] = []
      for (let i = 0; i < orderedFiles.length; i++) {
        const key = orderedFiles[i].editedR2Key || orderedFiles[i].r2Key
        if (!key) return NextResponse.json({ success: false, error: 'UNSUPPORTED_PHOTO', message: 'One or more selected photos are not eligible yet.' }, { status: 400 })
        const url = await getStudioR2SignedViewUrl(key)
        references.push({ kind: 'image', tag: tags[i], url, r2Key: key })
      }

      const durationSec = typeof requestedDurationSec === 'number' && requestedDurationSec >= 3 && requestedDurationSec <= 15
        ? requestedDurationSec
        : DEFAULT_AI_CLIP_DURATION_SEC
      const omniResolution = (OMNI_RESOLUTIONS as readonly string[]).includes(requestedResolution ?? '')
        ? (requestedResolution as (typeof OMNI_RESOLUTIONS)[number])
        : DEFAULT_OMNI_RESOLUTION
      const omniAspectRatio = (TEXT_TO_VIDEO_ASPECT_RATIOS as readonly string[]).includes(requestedAspectRatio ?? '')
        ? (requestedAspectRatio as (typeof TEXT_TO_VIDEO_ASPECT_RATIOS)[number])
        : DEFAULT_TEXT_TO_VIDEO_ASPECT_RATIO

      let studio = await studioGetItem<Studio>(TABLES.studios, { studioId: entry.studioId })
      if (!studio) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
      studio = await grantFreeTrialReelCreditsIfNeeded(studio)

      const pricing = await getPricingConfig()
      const { creditsRequired } = computeOmniVideoCost(durationSec, omniResolution, false, generateAudio, pricing)
      const creditCheck = checkReelCreditsAvailable(studio, creditsRequired)
      if (!creditCheck.ok) {
        return NextResponse.json({
          success: false, error: 'INSUFFICIENT_CREDITS',
          message: `This reel needs ${creditsRequired} credits — the studio has ${creditCheck.balance}.`,
          data: creditCheck,
        }, { status: 402 })
      }
      if (!process.env.REEL_LAMBDA_ARN) {
        console.error('[client reels POST] REEL_LAMBDA_ARN not set')
        return NextResponse.json({ success: false, error: 'NOT_CONFIGURED' }, { status: 503 })
      }

      await deductReelCredits(entry.studioId, creditsRequired)

      const reelId = randomUUID()
      const jobId = randomUUID()
      const now = new Date().toISOString()
      const ttl = Math.floor(Date.now() / 1000) + 24 * 60 * 60

      let created: Awaited<ReturnType<typeof createOmniVideoTask>>
      try {
        created = await createOmniVideoTask({
          reelId, prompt: autoPrompt, references,
          durationSec, aspectRatio: omniAspectRatio, resolution: omniResolution, generateAudio,
        })
      } catch (err) {
        await refundReelCredits(entry.studioId, creditsRequired)
        console.error('[client reels POST] Kling Omni task creation failed', err)
        return NextResponse.json({ success: false, error: 'GENERATION_FAILED', message: 'Could not start generation — please try again.' }, { status: 502 })
      }

      const reel: StudioReel = {
        reelId, jobId, studioId: entry.studioId, projectId,
        source: 'CLIENT_GALLERY',
        mode: 'omni',
        photoIds: orderedFiles.map((f) => f.fileId),
        omniReferences: references.map((r) => ({ kind: r.kind, tag: r.tag, r2Key: r.r2Key })),
        generateAudio,
        style: 'CINEMATIC',
        aspectRatio: omniAspectRatio,
        resolution: omniResolution,
        durationSec,
        customPrompt: sanitizedPrompt,
        status: 'generating',
        provider: created.provider,
        providerJobIds: [created.providerJobId],
        creditsCharged: creditsRequired,
        createdAt: now,
      }
      const job: StudioJob = {
        jobId, jobType: 'AI_REEL', status: 'PROCESSING',
        projectId, studioId: entry.studioId,
        inputPayload: { reelId, mode: 'omni' },
        outputPayload: { stage: 'generating', processed: 0, total: 1 },
        createdAt: now, ttl,
      }
      try {
        await studioPutItem(TABLES.reels, reel as unknown as Record<string, unknown>)
        await studioPutItem(TABLES.jobs, job as unknown as Record<string, unknown>)
      } catch (err) {
        await refundReelCredits(entry.studioId, creditsRequired)
        console.error('[client reels POST] failed to persist omni reel/job after Kling task was already created (orphaned providerJobId:', created.providerJobId, ')', err)
        return NextResponse.json({ success: false, error: 'GENERATION_FAILED', message: 'Could not start generation — please try again.' }, { status: 502 })
      }

      return NextResponse.json({ success: true, data: { reelId, jobId, creditsCharged: creditsRequired } })
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

    const template = getReelTemplate(templateId ?? DEFAULT_REEL_TEMPLATE)
    if (!template) {
      return NextResponse.json({ success: false, error: 'INVALID_TEMPLATE' }, { status: 400 })
    }
    const reelStyle = (REEL_STYLES as readonly string[]).includes(style ?? '') ? (style as ReelStyle) : 'CINEMATIC'
    // Never trust client-side truncation — re-cap server-side regardless of
    // what the modal already limited the textarea to.
    const sanitizedPrompt = typeof customPrompt === 'string' ? customPrompt.trim().slice(0, MAX_CUSTOM_PROMPT_LENGTH) : ''

    // Never trust client-supplied fileIds beyond using them as a filter —
    // re-derive the authoritative set from this project's own real files
    // (same discipline as every other bulk client-gallery/print-portal
    // action in this codebase).
    const allFiles = await studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', projectId)
    const requestedSet = new Set(photoIds)
    // fileType === 'IMAGE' is load-bearing — the Lambda calls Kling's
    // image-to-video endpoint, passing each file's URL as the still
    // "first_frame" to animate. It has no video-input capability at all, so
    // without this filter a selected video's URL was passed straight
    // through as if it were a photo, wasting a real paid Kling API call.
    const selectedFiles = allFiles.filter((f) => requestedSet.has(f.fileId) && f.processingStatus === 'READY' && f.fileType === 'IMAGE')
    if (selectedFiles.length !== photoIds.length) {
      return NextResponse.json({ success: false, error: 'INVALID_PHOTOS', message: 'Only photos can be used for AI Reels — videos aren\'t supported as an input.' }, { status: 400 })
    }

    // MVP: R2-backed photos only — every studio has already been migrated
    // (see CLAUDE.md R2 migration notes), so this isn't a real limitation
    // today, just an explicit scope cut rather than silently mishandling
    // pre-migration S3 records.
    const photos = selectedFiles.map((f) => ({ fileId: f.fileId, filename: f.originalFilename, key: f.editedR2Key || f.r2Key }))
    const missingR2Key = photos.find((p) => !p.key)
    if (missingR2Key) {
      return NextResponse.json({ success: false, error: 'UNSUPPORTED_PHOTO', message: 'One or more selected photos are not eligible for AI Reel generation yet.' }, { status: 400 })
    }

    let studio = await studioGetItem<Studio>(TABLES.studios, { studioId: entry.studioId })
    if (!studio) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    studio = await grantFreeTrialReelCreditsIfNeeded(studio)

    // MVP: every photo is a "hero clip" (Kling-only, no FFmpeg fallback yet).
    const pricing = await getPricingConfig()
    // resolution is validated against REEL_RESOLUTIONS ('720p'|'1080p' only)
    // above — ReelResolution's own '4k' member is Omni-only and can never
    // reach this photo-mode branch; narrowed here rather than widening
    // computeReelCost itself, which is genuinely 720p/1080p-only pricing.
    const { creditsRequired } = computeReelCost(photos.length, durationSec, resolution as '720p' | '1080p', pricing)
    const creditCheck = checkReelCreditsAvailable(studio, creditsRequired)
    if (!creditCheck.ok) {
      return NextResponse.json({
        success: false, error: 'INSUFFICIENT_CREDITS',
        message: `This reel needs ${creditsRequired} credits — the studio has ${creditCheck.balance}.`,
        data: creditCheck,
      }, { status: 402 })
    }

    if (!process.env.REEL_LAMBDA_ARN) {
      console.error('[client reels POST] REEL_LAMBDA_ARN not set')
      return NextResponse.json({ success: false, error: 'NOT_CONFIGURED' }, { status: 503 })
    }

    await deductReelCredits(entry.studioId, creditsRequired)

    const reelId = randomUUID()
    const jobId = randomUUID()
    const now = new Date().toISOString()
    const ttl = Math.floor(Date.now() / 1000) + 24 * 60 * 60

    // Async-redesign (Phase 2, 2026-09-21): Kling task creation now happens
    // HERE, in the route, instead of inside the reelgen Lambda — the Lambda
    // is only invoked later, by app/studio/api/cron/reel-check's periodic
    // poll, once every clip is already known to have succeeded (mode:
    // 'finalize'). See reelgen-async-redesign-plan-2026-09 in memory.
    //
    // Mint a plain fetchable HTTPS URL per photo (Kling needs a public GET
    // URL, not R2 credentials or embedded bytes) — same mechanism the legacy
    // Lambda pipeline still uses inline for the 'photo' mode branch, moved
    // here now that task creation itself lives in the route.
    const stylePromptFragment = [sanitizedPrompt || null, REEL_STYLE_META[reelStyle].promptFragment, droneFragment]
      .filter(Boolean).join(', ')

    // Credits are already deducted above — everything from here through task
    // creation must refund on ANY failure, not just the "some clips failed"
    // case below. A synchronous throw (e.g. router.select() finding no
    // provider configured, or a presigned-URL mint failing) would otherwise
    // bypass the `created.failed.length > 0` check entirely and leak the
    // deduction with nothing to show for it — wrapped explicitly rather than
    // relying on the outer catch, which has no refund logic of its own.
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
      await refundReelCredits(entry.studioId, creditsRequired)
      console.error('[client reels POST] Kling task creation threw before any clip could be created', err)
      return NextResponse.json({ success: false, error: 'GENERATION_FAILED', message: 'Could not start generation — please try again.' }, { status: 502 })
    }

    // MVP: a partial batch (some photos' Kling calls succeeded, others
    // failed) fails the whole reel rather than silently dropping the failed
    // photos or leaving orphaned, untracked Kling tasks running — matches
    // the "MVP has no partial-failure UI" scope cut already documented on
    // the legacy pipeline this replaces.
    if (created.failed.length > 0) {
      await refundReelCredits(entry.studioId, creditsRequired)
      console.error('[client reels POST] Kling task creation failed for one or more photos', created.failed)
      return NextResponse.json({ success: false, error: 'GENERATION_FAILED', message: 'Could not start generation — please try again.' }, { status: 502 })
    }

    const reel: StudioReel = {
      reelId, jobId, studioId: entry.studioId, projectId,
      source: 'CLIENT_GALLERY',
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
      // Ordered identically to photoIds/clipsForKling above (Promise.all
      // preserves input order, and createReelClipTasks only reaches here
      // when every clip succeeded) — app/studio/api/cron/reel-check relies
      // on this order matching for the final assembled clip sequence.
      providerJobIds: created.succeeded.map((s) => s.providerJobId),
      creditsCharged: creditsRequired,
      createdAt: now,
    }
    const job: StudioJob = {
      jobId, jobType: 'AI_REEL',
      // PROCESSING, not PENDING — no Lambda invocation is pending anymore,
      // Kling tasks are already live as of this request. The periodic
      // reel-check route finds this via the jobType-status-index GSI.
      status: 'PROCESSING',
      projectId, studioId: entry.studioId,
      inputPayload: { reelId, photoCount: photos.length },
      outputPayload: { stage: 'generating', processed: 0, total: photos.length },
      createdAt: now, ttl,
    }
    // The Kling clip tasks above are already real and billed — a write
    // failure here would otherwise leak the studio's credits and leave the
    // paid clips with no record for reel-check to find (recoverable later
    // via attemptReclaimReelClips since the deterministic
    // `${reelId}-${photoId}` id is recomputable, but that needs a manual/UI
    // reclaim attempt — refunding immediately here is still strictly better
    // than silently losing the credits with no explanation).
    try {
      await studioPutItem(TABLES.reels, reel as unknown as Record<string, unknown>)
      await studioPutItem(TABLES.jobs, job as unknown as Record<string, unknown>)
    } catch (err) {
      await refundReelCredits(entry.studioId, creditsRequired)
      console.error('[client reels POST] failed to persist reel/job after Kling tasks were already created (reelId:', reelId, ')', err)
      return NextResponse.json({ success: false, error: 'GENERATION_FAILED', message: 'Could not start generation — please try again.' }, { status: 502 })
    }

    return NextResponse.json({ success: true, data: { reelId, jobId, creditsCharged: creditsRequired } })
  } catch (err) {
    console.error('[client reels POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
