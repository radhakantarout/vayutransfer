import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByIndex, studioQueryByPK, studioGetItem, studioPutItem, TABLES } from '@/lib/studio/dynamodb'
import { getStudioR2SignedDownloadUrl } from '@/lib/studio/r2'
import { checkReelCreditsAvailable } from '@/lib/studio/quota'
import { deductReelCredits, grantFreeTrialReelCreditsIfNeeded } from '@/lib/studio/billing'
import { resolveProjectForViewer, isOwnerOrAdmin } from '@/lib/studio/galleryMembers'
import {
  computeReelCost, MIN_REEL_PHOTOS, MAX_REEL_PHOTOS, DEFAULT_REEL_RESOLUTION, DEFAULT_AI_CLIP_DURATION_SEC,
  REEL_STYLES, REEL_STYLE_META, getReelTemplate, DEFAULT_REEL_TEMPLATE, REEL_ASPECT_RATIO_DIMENSIONS, MAX_CUSTOM_PROMPT_LENGTH,
} from '@/constants/videoProviders'
import type { MediaFile, Studio, StudioJob, StudioReel, ReelStyle } from '@/types/studio'

const lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

// Same "MVP" pipeline as the Client Gallery's reel routes — every selected
// photo becomes one Kling AI clip, reusing the exact same Lambda/billing/job
// plumbing. Only the auth shape differs: no clientShareToken lookup at all,
// since a Moments session is already scoped to the caller's own personal
// Studio via the JWT (same as every other /studio/api/moments/* route) —
// there's no separate "client of someone else's project" concept here, the
// uploader IS the owner.

// "My Reels" history for one Moments event.
export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

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
    console.error('[moments reels GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    const { project, member } = resolved
    const studioId = project.studioId

    // Any approved member can create a reel IF the gallery's admin has
    // turned it on (allowMemberReels, off by default — every reel costs
    // real Kling money) — admins can always create reels regardless.
    if (!isOwnerOrAdmin(auth.studioId, project, member) && !project.allowMemberReels) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN', message: 'The gallery owner hasn\'t turned on Reels for members yet.' }, { status: 403 })
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
    const sanitizedPrompt = typeof customPrompt === 'string' ? customPrompt.trim().slice(0, MAX_CUSTOM_PROMPT_LENGTH) : ''

    const allFiles = await studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', projectId)
    const requestedSet = new Set(photoIds)
    const selectedFiles = allFiles.filter((f) => requestedSet.has(f.fileId) && f.processingStatus === 'READY')
    if (selectedFiles.length !== photoIds.length) {
      return NextResponse.json({ success: false, error: 'INVALID_PHOTOS', message: 'Some selected photos are not available.' }, { status: 400 })
    }

    const photos = selectedFiles.map((f) => ({ fileId: f.fileId, filename: f.originalFilename, key: f.editedR2Key || f.r2Key }))
    const missingR2Key = photos.find((p) => !p.key)
    if (missingR2Key) {
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
        message: `This reel needs ${creditsRequired} credits — you have ${creditCheck.balance}.`,
        data: creditCheck,
      }, { status: 402 })
    }

    if (!process.env.REEL_LAMBDA_ARN) {
      console.error('[moments reels POST] REEL_LAMBDA_ARN not set')
      return NextResponse.json({ success: false, error: 'NOT_CONFIGURED' }, { status: 503 })
    }

    await deductReelCredits(studioId, creditsRequired)

    const reelId = randomUUID()
    const jobId = randomUUID()
    const now = new Date().toISOString()
    const ttl = Math.floor(Date.now() / 1000) + 24 * 60 * 60

    const reel: StudioReel = {
      reelId, jobId, studioId, projectId,
      source: 'MOMENTS',
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
      inputPayload: { reelId, photoCount: photos.length },
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
      console.error('[moments reels POST] Lambda invoke failed', err)
      await refundReelCreditsAndFail(studioId, creditsRequired, jobId, reelId)
    })

    return NextResponse.json({ success: true, data: { reelId, jobId, creditsCharged: creditsRequired } })
  } catch (err) {
    console.error('[moments reels POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

async function refundReelCreditsAndFail(studioId: string, credits: number, jobId: string, reelId: string) {
  const { refundReelCredits } = await import('@/lib/studio/billing')
  const { studioUpdateItem } = await import('@/lib/studio/dynamodb')
  await refundReelCredits(studioId, credits)
  const now = new Date().toISOString()
  await studioUpdateItem(TABLES.jobs, { jobId }, 'SET #s = :failed, errorMessage = :msg, completedAt = :now', { ':failed': 'FAILED', ':msg': 'Could not start generation', ':now': now }, { '#s': 'status' })
  await studioUpdateItem(TABLES.reels, { reelId }, 'SET #s = :failed, errorMessage = :msg, completedAt = :now', { ':failed': 'failed', ':msg': 'Could not start generation', ':now': now }, { '#s': 'status' })
}
