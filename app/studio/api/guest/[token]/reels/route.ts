import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { randomUUID } from 'crypto'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { studioGetItem, studioPutItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { checkReelCreditsAvailable } from '@/lib/studio/quota'
import { deductReelCredits, refundReelCredits, grantFreeTrialReelCreditsIfNeeded } from '@/lib/studio/billing'
import {
  computeReelCost, MIN_REEL_PHOTOS, MAX_REEL_PHOTOS, DEFAULT_REEL_RESOLUTION, DEFAULT_AI_CLIP_DURATION_SEC,
  REEL_STYLES, REEL_STYLE_META, getReelTemplate, DEFAULT_REEL_TEMPLATE, REEL_ASPECT_RATIO_DIMENSIONS, MAX_CUSTOM_PROMPT_LENGTH,
} from '@/constants/videoProviders'
import type { MediaFile, Studio, StudioJob, StudioReel, ReelStyle } from '@/types/studio'

const lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

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

    const { photoIds, searchSessionId, templateId, style, customPrompt } = await req.json().catch(() => ({})) as {
      photoIds?: string[]; searchSessionId?: string; templateId?: string; style?: string; customPrompt?: string
    }
    if (!Array.isArray(photoIds) || photoIds.length < MIN_REEL_PHOTOS) {
      return NextResponse.json({ success: false, error: 'INVALID_PHOTO_COUNT', message: 'Select at least 1 photo.' }, { status: 400 })
    }
    if (photoIds.length > MAX_REEL_PHOTOS) {
      return NextResponse.json({ success: false, error: 'TOO_MANY_PHOTOS', message: `You can select up to ${MAX_REEL_PHOTOS} photos per reel.` }, { status: 400 })
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
    const selectedFiles = allFiles.filter((f): f is MediaFile => !!f && f.processingStatus === 'READY')
    if (selectedFiles.length !== photoIds.length) {
      return NextResponse.json({ success: false, error: 'INVALID_PHOTOS', message: 'Some selected photos are not available.' }, { status: 400 })
    }

    const photos = selectedFiles.map((f) => ({ fileId: f.fileId, filename: f.originalFilename, key: f.editedR2Key || f.r2Key }))
    if (photos.find((p) => !p.key)) {
      return NextResponse.json({ success: false, error: 'UNSUPPORTED_PHOTO', message: 'One or more selected photos are not eligible for AI Reel generation yet.' }, { status: 400 })
    }

    let studio = await studioGetItem<Studio>(TABLES.studios, { studioId })
    if (!studio) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    studio = await grantFreeTrialReelCreditsIfNeeded(studio)

    const durationSec = DEFAULT_AI_CLIP_DURATION_SEC
    const { creditsRequired } = computeReelCost(photos.length, durationSec)
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

    const reel: StudioReel = {
      reelId, jobId, studioId, projectId,
      source: 'GUEST_SELFIE_SEARCH',
      guestJwtProjectId: projectId,
      photoIds: selectedFiles.map((f) => f.fileId),
      style: reelStyle,
      templateId: template.id,
      aspectRatio: template.aspectRatio,
      resolution: DEFAULT_REEL_RESOLUTION,
      durationSec: durationSec * photos.length,
      status: 'generating',
      provider: 'kling',
      creditsCharged: creditsRequired,
      createdAt: now,
    }
    await studioPutItem(TABLES.reels, reel as unknown as Record<string, unknown>)

    const job: StudioJob = {
      jobId, jobType: 'AI_REEL', status: 'PENDING',
      projectId, studioId,
      inputPayload: { reelId, photoCount: photos.length, source: 'GUEST_SELFIE_SEARCH' },
      createdAt: now, ttl,
    }
    await studioPutItem(TABLES.jobs, job as unknown as Record<string, unknown>)

    lambda.send(new InvokeCommand({
      FunctionName: process.env.REEL_LAMBDA_ARN,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify({
        jobId, reelId, studioId, projectId,
        photos, durationSec, resolution: DEFAULT_REEL_RESOLUTION,
        style: reelStyle,
        stylePromptFragment: sanitizedPrompt
          ? `${sanitizedPrompt}, ${REEL_STYLE_META[reelStyle].promptFragment}`
          : REEL_STYLE_META[reelStyle].promptFragment,
        targetDimensions: REEL_ASPECT_RATIO_DIMENSIONS[template.aspectRatio],
        r2Bucket: process.env.STUDIO_R2_ORIGINAL_BUCKET,
        r2Endpoint: process.env.STUDIO_R2_ENDPOINT,
        r2AccessKeyId: process.env.STUDIO_R2_ORIGINAL_ACCESS_KEY_ID,
        r2SecretAccessKey: process.env.STUDIO_R2_ORIGINAL_SECRET_ACCESS_KEY,
        klingApiKey: process.env.KLING_API_KEY,
        klingApiBaseUrl: process.env.KLING_API_BASE_URL || 'https://api-singapore.klingai.com',
        klingModelName: process.env.KLING_MODEL_NAME || 'kling-3.0-turbo',
      })),
    })).catch(async (err: unknown) => {
      console.error('[guest reels POST] Lambda invoke failed', err)
      await refundReelCredits(studioId, creditsRequired)
      const failedAt = new Date().toISOString()
      await studioUpdateItem(TABLES.jobs, { jobId }, 'SET #s = :failed, errorMessage = :msg, completedAt = :now', { ':failed': 'FAILED', ':msg': 'Could not start generation', ':now': failedAt }, { '#s': 'status' })
      await studioUpdateItem(TABLES.reels, { reelId }, 'SET #s = :failed, errorMessage = :msg, completedAt = :now', { ':failed': 'failed', ':msg': 'Could not start generation', ':now': failedAt }, { '#s': 'status' })
    })

    return NextResponse.json({ success: true, data: { reelId, jobId, creditsCharged: creditsRequired } })
  } catch (err) {
    console.error('[guest reels POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
