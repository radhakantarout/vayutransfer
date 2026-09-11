import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByIndex, studioQueryByPK, studioGetItem, studioPutItem, TABLES } from '@/lib/studio/dynamodb'
import { getStudioR2SignedDownloadUrl } from '@/lib/studio/r2'
import { checkReelCreditsAvailable } from '@/lib/studio/quota'
import { deductReelCredits } from '@/lib/studio/billing'
import {
  computeReelCost, MIN_REEL_PHOTOS, MAX_REEL_PHOTOS, DEFAULT_REEL_RESOLUTION, DEFAULT_AI_CLIP_DURATION_SEC,
  REEL_STYLES, REEL_STYLE_META, getReelTemplate, DEFAULT_REEL_TEMPLATE, REEL_ASPECT_RATIO_DIMENSIONS, MAX_CUSTOM_PROMPT_LENGTH,
} from '@/constants/videoProviders'
import type { StudioProject, MediaFile, Studio, StudioJob, StudioReel, ReelStyle } from '@/types/studio'

const lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

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

    const { photoIds, templateId, style, customPrompt } = await req.json().catch(() => ({})) as {
      photoIds?: string[]; templateId?: string; style?: string; customPrompt?: string
    }
    if (!Array.isArray(photoIds) || photoIds.length < MIN_REEL_PHOTOS) {
      return NextResponse.json({ success: false, error: 'INVALID_PHOTO_COUNT', message: 'Select at least 1 photo.' }, { status: 400 })
    }
    if (photoIds.length > MAX_REEL_PHOTOS) {
      return NextResponse.json({ success: false, error: 'TOO_MANY_PHOTOS', message: `You can select up to ${MAX_REEL_PHOTOS} photos per reel.` }, { status: 400 })
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
    const selectedFiles = allFiles.filter((f) => requestedSet.has(f.fileId) && f.processingStatus === 'READY')
    if (selectedFiles.length !== photoIds.length) {
      return NextResponse.json({ success: false, error: 'INVALID_PHOTOS', message: 'Some selected photos are not available.' }, { status: 400 })
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

    const studio = await studioGetItem<Studio>(TABLES.studios, { studioId: entry.studioId })
    if (!studio) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    // MVP: every photo is a "hero clip" (Kling-only, no FFmpeg fallback yet).
    const durationSec = DEFAULT_AI_CLIP_DURATION_SEC
    const { creditsRequired } = computeReelCost(photos.length, durationSec)
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

    const reel: StudioReel = {
      reelId, jobId, studioId: entry.studioId, projectId,
      source: 'CLIENT_GALLERY',
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
      projectId, studioId: entry.studioId,
      inputPayload: { reelId, photoCount: photos.length },
      createdAt: now, ttl,
    }
    await studioPutItem(TABLES.jobs, job as unknown as Record<string, unknown>)

    lambda.send(new InvokeCommand({
      FunctionName: process.env.REEL_LAMBDA_ARN,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify({
        jobId, reelId, studioId: entry.studioId, projectId,
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
      console.error('[client reels POST] Lambda invoke failed', err)
      await refundReelCreditsAndFail(entry.studioId, creditsRequired, jobId, reelId)
    })

    return NextResponse.json({ success: true, data: { reelId, jobId, creditsCharged: creditsRequired } })
  } catch (err) {
    console.error('[client reels POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

// Extracted to keep the invoke .catch() readable — only reachable if the
// InvokeCommand call itself fails synchronously (network/IAM error before
// the Lambda ever ran), NOT for the Lambda's own internal failures, which
// it reports itself via updateJob/updateReel.
async function refundReelCreditsAndFail(studioId: string, credits: number, jobId: string, reelId: string) {
  const { refundReelCredits } = await import('@/lib/studio/billing')
  const { studioUpdateItem } = await import('@/lib/studio/dynamodb')
  await refundReelCredits(studioId, credits)
  const now = new Date().toISOString()
  await studioUpdateItem(TABLES.jobs, { jobId }, 'SET #s = :failed, errorMessage = :msg, completedAt = :now', { ':failed': 'FAILED', ':msg': 'Could not start generation', ':now': now }, { '#s': 'status' })
  await studioUpdateItem(TABLES.reels, { reelId }, 'SET #s = :failed, errorMessage = :msg, completedAt = :now', { ':failed': 'failed', ':msg': 'Could not start generation', ':now': now }, { '#s': 'status' })
}
