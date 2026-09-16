import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByIndex, studioQueryByPK, studioGetItem, studioPutItem, TABLES } from '@/lib/studio/dynamodb'
import { getStudioR2SignedDownloadUrl } from '@/lib/studio/r2'
import { checkAiCreditsAvailable } from '@/lib/studio/quota'
import { deductAiSearchCredits } from '@/lib/studio/billing'
import { aiSearchCreditPricePaise, toMomentsCredits } from '@/constants/studioPricing'
import { getPricingConfig } from '@/lib/pricingConfig'
import { resolveProjectForViewer, isOwnerOrAdmin } from '@/lib/studio/galleryMembers'
import { reelJobProgress } from '@/lib/studio/reelProgress'
import {
  computeReelCost, MIN_REEL_PHOTOS, MAX_REEL_PHOTOS, MAX_REEL_TOTAL_DURATION_SEC, REEL_RESOLUTIONS, DEFAULT_REEL_RESOLUTION,
  REEL_CLIP_DURATION_OPTIONS, DEFAULT_AI_CLIP_DURATION_SEC,
  REEL_STYLES, REEL_STYLE_META, getReelTemplate, DEFAULT_REEL_TEMPLATE, REEL_ASPECT_RATIO_DIMENSIONS, MAX_CUSTOM_PROMPT_LENGTH,
  DRONE_SHOT_STYLES, DRONE_SHOT_META,
} from '@/constants/videoProviders'
import type { MediaFile, Studio, StudioJob, StudioReel, ReelStyle, ReelResolution } from '@/types/studio'

const lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

// Same "MVP" pipeline as the Client Gallery's reel routes — every selected
// photo becomes one Kling AI clip, reusing the exact same Lambda/job
// plumbing. Only the auth shape differs: no clientShareToken lookup at all,
// since a Moments session is already scoped to the caller's own personal
// Studio via the JWT (same as every other /studio/api/moments/* route) —
// there's no separate "client of someone else's project" concept here, the
// uploader IS the owner.
//
// Billing DIVERGES from Client Gallery's reel route deliberately: Moments
// consumers spend from the SAME aiSearchCredits pool used for face-indexing
// (₹0.30/credit) rather than the separate reelCreditsBalance pool (₹80/
// credit) — one balance to think about and top up, instead of two. The
// reel's ₹ cost is computed exactly the same way (computeReelCost), just
// converted into AI-credit units instead of reel-credit units before the
// check/deduct. Client Gallery/Studio Admin's own reel route is untouched.

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
      progress: r.status === 'generating' ? await reelJobProgress(r.jobId) : null,
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

    const { photoIds, templateId, style, customPrompt, resolution: requestedResolution, durationSec: requestedDurationSec, droneShot: requestedDroneShot } = await req.json().catch(() => ({})) as {
      photoIds?: string[]; templateId?: string; style?: string; customPrompt?: string; resolution?: string; durationSec?: number; droneShot?: string
    }
    // Never trust a client-supplied resolution/duration blindly — fall back
    // to the defaults on anything outside the allowed sets rather than
    // rejecting the whole request, same posture as templateId/style below.
    const resolution: ReelResolution = (REEL_RESOLUTIONS as readonly string[]).includes(requestedResolution ?? '')
      ? (requestedResolution as ReelResolution)
      : DEFAULT_REEL_RESOLUTION
    const durationSec = (REEL_CLIP_DURATION_OPTIONS as readonly number[]).includes(requestedDurationSec ?? -1)
      ? (requestedDurationSec as number)
      : DEFAULT_AI_CLIP_DURATION_SEC
    // Drone Mode is opt-in — undefined/invalid means off, never a silent
    // fallback to some default drone shot the user never asked for.
    const droneFragment = requestedDroneShot && (DRONE_SHOT_STYLES as readonly string[]).includes(requestedDroneShot)
      ? DRONE_SHOT_META[requestedDroneShot as (typeof DRONE_SHOT_STYLES)[number]].promptFragment
      : null
    if (!Array.isArray(photoIds) || photoIds.length < MIN_REEL_PHOTOS) {
      return NextResponse.json({ success: false, error: 'INVALID_PHOTO_COUNT', message: 'Select at least 1 photo.' }, { status: 400 })
    }
    if (photoIds.length > MAX_REEL_PHOTOS) {
      return NextResponse.json({ success: false, error: 'TOO_MANY_PHOTOS', message: `You can select up to ${MAX_REEL_PHOTOS} photos per reel.` }, { status: 400 })
    }
    // Hard ceiling on TOTAL Kling-generated seconds, independent of
    // MAX_REEL_PHOTOS/REEL_CLIP_DURATION_OPTIONS individually — the real
    // cost driver is their PRODUCT, and this must hold even if either limit
    // is loosened later without someone re-deriving the worst case by hand.
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
    const sanitizedPrompt = typeof customPrompt === 'string' ? customPrompt.trim().slice(0, MAX_CUSTOM_PROMPT_LENGTH) : ''

    const allFiles = await studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', projectId)
    const requestedSet = new Set(photoIds)
    // fileType === 'IMAGE' is load-bearing, not cosmetic: the Lambda calls
    // Kling's image-to-video endpoint, passing each selected file's URL as
    // the still "first_frame" to animate — it has no video-input capability
    // at all (that would be a different Kling endpoint/feature entirely).
    // Without this filter, a selected video file's URL got passed straight
    // through as if it were a photo, wasting a real paid Kling API call on
    // an input its own API was never going to accept.
    const selectedFiles = allFiles.filter((f) => requestedSet.has(f.fileId) && f.processingStatus === 'READY' && f.fileType === 'IMAGE')
    if (selectedFiles.length !== photoIds.length) {
      return NextResponse.json({ success: false, error: 'INVALID_PHOTOS', message: 'Only photos can be used for AI Reels — videos aren\'t supported as an input.' }, { status: 400 })
    }

    const photos = selectedFiles.map((f) => ({ fileId: f.fileId, filename: f.originalFilename, key: f.editedR2Key || f.r2Key }))
    const missingR2Key = photos.find((p) => !p.key)
    if (missingR2Key) {
      return NextResponse.json({ success: false, error: 'UNSUPPORTED_PHOTO', message: 'One or more selected photos are not eligible for AI Reel generation yet.' }, { status: 400 })
    }

    const studio = await studioGetItem<Studio>(TABLES.studios, { studioId })
    if (!studio) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    // Same dedupe pattern as face-indexing (faces/index/route.ts) — without
    // this, nothing stopped a scripted rapid-fire loop of POSTs (each
    // triggering a real, paid Kling Lambda invoke) beyond the credit check
    // alone, which itself only narrowly stops overspend, not repeated
    // legitimate-looking requests for the same gallery.
    const runningJobs = await studioQueryByIndex<StudioJob>(
      TABLES.jobs,
      'projectId-status-index',
      'projectId = :pid AND #s = :processing',
      { ':pid': projectId, ':processing': 'PROCESSING' },
      { '#s': 'status' },
      25
    )
    const runningReelJob = runningJobs.find((j) => j.jobType === 'AI_REEL')
    if (runningReelJob) {
      return NextResponse.json({
        success: false, error: 'JOB_RUNNING', data: { jobId: runningReelJob.jobId },
      }, { status: 409 })
    }

    const pricing = await getPricingConfig()
    const { sellPricePaise } = computeReelCost(photos.length, durationSec, resolution, pricing)
    const creditPrice = aiSearchCreditPricePaise(pricing.aiExtraPaisePer1000)
    const aiCreditsRequired = Math.max(1, Math.ceil(sellPricePaise / creditPrice))
    const creditCheck = checkAiCreditsAvailable(studio, aiCreditsRequired, pricing.freeAiSearchCredits)
    if (!creditCheck.ok) {
      // This route is Moments-only — always the friendly "Moments Credits"
      // unit here, matching Profile/UsageBillingPanel's display, not the raw
      // AI-search-credit count the backend actually accounts in. Showing
      // raw units here (e.g. "568 AI credits" against a Profile screen that
      // says "20 Moments Credits") was a real, confusing mismatch even
      // though the underlying math/enforcement was always correct.
      const divisor = pricing.momentsCreditDivisor
      const neededDisplay = toMomentsCredits(aiCreditsRequired, divisor)
      const leftDisplay = toMomentsCredits(Math.max(0, creditCheck.quotaCredits - creditCheck.usedCredits), divisor)
      return NextResponse.json({
        success: false, error: 'INSUFFICIENT_CREDITS',
        message: `This reel needs ${neededDisplay} Moments Credits — you have ${leftDisplay} left.`,
        data: creditCheck,
      }, { status: 402 })
    }

    if (!process.env.REEL_LAMBDA_ARN) {
      console.error('[moments reels POST] REEL_LAMBDA_ARN not set')
      return NextResponse.json({ success: false, error: 'NOT_CONFIGURED' }, { status: 503 })
    }

    const creditsRequired = aiCreditsRequired
    try {
      // ceilingCredits comes from the check just above — deductAiSearchCredits
      // re-verifies atomically against the item's live aiSearchCreditsUsed at
      // write time, so a concurrent request that already consumed the
      // remaining headroom correctly fails here even though both requests
      // passed the read-only check above.
      await deductAiSearchCredits(studioId, creditsRequired, creditCheck.quotaCredits)
    } catch (err) {
      console.error('[moments reels POST] credit deduction lost a concurrency race', err)
      return NextResponse.json({
        success: false, error: 'INSUFFICIENT_CREDITS',
        message: 'Someone just used the last of these credits — please check your balance and try again.',
      }, { status: 402 })
    }

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
      resolution,
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
        photos, durationSec, resolution,
        style: reelStyle,
        stylePromptFragment: [sanitizedPrompt || null, REEL_STYLE_META[reelStyle].promptFragment, droneFragment]
          .filter(Boolean).join(', '),
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
      await refundAiCreditsAndFail(studioId, creditsRequired, jobId, reelId)
    })

    return NextResponse.json({ success: true, data: { reelId, jobId, creditsCharged: creditsRequired } })
  } catch (err) {
    console.error('[moments reels POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

async function refundAiCreditsAndFail(studioId: string, credits: number, jobId: string, reelId: string) {
  const { refundAiSearchCredits } = await import('@/lib/studio/billing')
  const { studioUpdateItem } = await import('@/lib/studio/dynamodb')
  await refundAiSearchCredits(studioId, credits)
  const now = new Date().toISOString()
  await studioUpdateItem(TABLES.jobs, { jobId }, 'SET #s = :failed, errorMessage = :msg, completedAt = :now', { ':failed': 'FAILED', ':msg': 'Could not start generation', ':now': now }, { '#s': 'status' })
  await studioUpdateItem(TABLES.reels, { reelId }, 'SET #s = :failed, errorMessage = :msg, completedAt = :now', { ':failed': 'failed', ':msg': 'Could not start generation', ':now': now }, { '#s': 'status' })
}
