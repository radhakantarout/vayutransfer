import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByIndex, studioQueryByPK, studioGetItem, studioPutItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { getStudioR2SignedDownloadUrl } from '@/lib/studio/r2'
import { checkAiCreditsAvailable } from '@/lib/studio/quota'
import { deductAiSearchCredits, refundAiSearchCredits } from '@/lib/studio/billing'
import { aiSearchCreditPricePaise, toMomentsCredits } from '@/constants/studioPricing'
import { computeImageEditCost } from '@/constants/aiImageEditing'
import { getPricingConfig } from '@/lib/pricingConfig'
import { resolveProjectForViewer, isOwnerOrAdmin } from '@/lib/studio/galleryMembers'
import { MAX_CUSTOM_PROMPT_LENGTH } from '@/constants/videoProviders'
import type { MediaFile, Studio, StudioJob, StudioAiImage, AiImageMode, AiImageResolution, AiImageAspectRatio } from '@/types/studio'

const lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

const MIN_AI_IMAGES = 1
const MAX_AI_IMAGES = 9
const MAX_SOURCE_IMAGES = 10
// No '4K' — confirmed against a real Kling API call (2026-09-18) that this
// account/tier rejects it outright ("resolution value '4k' is not
// supported"). See lambda/vayustudio-imagegen/providers/kling.js's header.
const AI_IMAGE_RESOLUTIONS: readonly AiImageResolution[] = ['1K', '2K']
const AI_IMAGE_ASPECT_RATIOS: readonly AiImageAspectRatio[] = ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9']

// AI Image Studio (Moments) — same MVP shape as the reel route (moments/
// events/[projectId]/reels/route.ts): a fire-and-forget Lambda invoke,
// atomic AI-search-credit deduction from the same unified pool, job/record
// created up front so the poll route has something to read immediately.
// Generated images are NOT MediaFile rows yet — they land as staged R2 keys
// on the StudioAiImage record (see lambda/vayustudio-imagegen), promoted to
// real gallery photos one-by-one via POST .../ai-images/[imageId]/save.
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

    const images = await studioQueryByIndex<StudioAiImage>(
      TABLES.aiImages, 'projectId-createdAt-index', 'projectId = :p', { ':p': projectId }
    )
    images.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))

    const data = await Promise.all(images.map(async (img) => ({
      imageId: img.imageId,
      mode: img.mode,
      status: img.status,
      prompt: img.prompt,
      resolution: img.resolution,
      aspectRatio: img.aspectRatio,
      numImages: img.numImages,
      sourceCount: img.sourceFileIds?.length ?? 0,
      creditsCharged: img.creditsCharged ?? 0,
      createdAt: img.createdAt,
      completedAt: img.completedAt ?? null,
      errorMessage: img.errorMessage ?? null,
      savedFileIds: img.savedFileIds ?? [],
      // Staged results, freshly presigned on every read — same "never store
      // a presigned URL" rule as every other download in this codebase.
      stagedUrls: img.status === 'completed' && img.outputR2Keys
        ? await Promise.all(img.outputR2Keys.map((key, i) => getStudioR2SignedDownloadUrl(key, `ai-image-${img.imageId}-${i}.jpg`, 3600)))
        : [],
    })))

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[moments ai-images GET]', err)
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

    // Same "admin turned it on" gate as reels — every generation costs real
    // provider money.
    if (!isOwnerOrAdmin(auth.studioId, project, member) && !project.allowMemberReels) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN', message: 'The gallery owner hasn\'t turned on AI generation for members yet.' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({})) as {
      mode?: string; prompt?: string; sourceFileIds?: string[]
      resolution?: string; aspectRatio?: string; numImages?: number
    }
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, MAX_CUSTOM_PROMPT_LENGTH) : ''
    if (!prompt) {
      return NextResponse.json({ success: false, error: 'MISSING_PROMPT', message: 'Describe what you want to generate.' }, { status: 400 })
    }
    const sourceFileIds = Array.isArray(body.sourceFileIds)
      ? Array.from(new Set(body.sourceFileIds)).slice(0, MAX_SOURCE_IMAGES)
      : []
    const mode: AiImageMode = sourceFileIds.length > 0 ? 'edit' : 'generate'
    const resolution: AiImageResolution = AI_IMAGE_RESOLUTIONS.includes(body.resolution as AiImageResolution)
      ? (body.resolution as AiImageResolution) : '1K'
    const aspectRatio: AiImageAspectRatio = AI_IMAGE_ASPECT_RATIOS.includes(body.aspectRatio as AiImageAspectRatio)
      ? (body.aspectRatio as AiImageAspectRatio) : 'auto'
    const numImages = Number.isInteger(body.numImages) && (body.numImages as number) >= MIN_AI_IMAGES && (body.numImages as number) <= MAX_AI_IMAGES
      ? (body.numImages as number) : 1

    let sourceKeys: string[] = []
    if (mode === 'edit') {
      // Never trust client-supplied fileIds beyond using them to look up
      // this project's own real files — but the CLIENT's order must be
      // preserved (map over sourceFileIds, not allFiles' own DB-query
      // order), since this array order becomes @Image1/@Image2/... in
      // Kling's prompt syntax. The UI shows the user exactly this
      // numbering against their selected photos — silently re-ordering it
      // server-side would make the prompt reference the wrong photo with
      // no error surfaced anywhere.
      const allFiles = await studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', projectId)
      const byId = new Map(allFiles.map((f) => [f.fileId, f]))
      const selectedFiles = sourceFileIds
        .map((id) => byId.get(id))
        .filter((f): f is MediaFile => !!f && f.processingStatus === 'READY' && f.fileType === 'IMAGE')
      if (selectedFiles.length !== sourceFileIds.length) {
        return NextResponse.json({ success: false, error: 'INVALID_PHOTOS', message: 'One or more selected photos are not eligible for AI editing.' }, { status: 400 })
      }
      sourceKeys = selectedFiles.map((f) => f.editedR2Key || f.r2Key).filter((k): k is string => !!k)
      if (sourceKeys.length !== selectedFiles.length) {
        return NextResponse.json({ success: false, error: 'UNSUPPORTED_PHOTO', message: 'One or more selected photos are not eligible for AI editing yet.' }, { status: 400 })
      }
    }

    // Real product bug found 2026-09-20: passing `image_urls` alone does NOT
    // guarantee Kling actually treats the photo(s) as an edit target — its
    // @Image1/@Image2 prompt syntax (see lambda/vayustudio-imagegen/providers/
    // kling.js's header) is how it decides WHICH reference to anchor to.
    // Without it, "editing" silently degraded into an unrelated new
    // generation that just happened to share the same prompt. If the user's
    // own prompt already references at least one VALID @ImageN (an index
    // actually within the selected photo count — a typo'd/out-of-range
    // mention like "@Image5" with only 2 photos selected must NOT count as
    // "handled", since Kling would have nothing real to anchor that to,
    // reproducing the exact same bug through a different path), respect
    // their explicit choice untouched (they may be doing deliberate
    // multi-image fusion, e.g. "combine @Image1 and @Image2"). Otherwise
    // auto-anchor every selected photo so editing always actually applies —
    // this is what makes a single selected photo "just work" as the
    // reference with zero extra step, and gives multi-photo edits a safe
    // default instead of silently ignoring all of them. Only the prompt SENT
    // to Kling is augmented — the stored `prompt` stays exactly what the
    // user typed, so history/regenerate reflect their real input.
    const validMentionPattern = new RegExp(`@image(${sourceFileIds.map((_, i) => i + 1).join('|')})\\b`, 'i')
    const hasValidMention = mode === 'edit' && sourceFileIds.length > 0 && validMentionPattern.test(prompt)
    const finalPrompt = mode === 'edit' && !hasValidMention
      ? `${sourceFileIds.map((_, i) => `@Image${i + 1}`).join(' ')} ${prompt}`.slice(0, MAX_CUSTOM_PROMPT_LENGTH)
      : prompt

    const studio = await studioGetItem<Studio>(TABLES.studios, { studioId })
    if (!studio) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    // Same per-project in-flight dedupe as reels — without it nothing stops
    // a rapid-fire loop of POSTs each triggering a real, paid Lambda invoke.
    const runningJobs = await studioQueryByIndex<StudioJob>(
      TABLES.jobs, 'projectId-status-index', 'projectId = :pid AND #s = :processing',
      { ':pid': projectId, ':processing': 'PROCESSING' }, { '#s': 'status' }, 25
    )
    if (runningJobs.find((j) => j.jobType === 'AI_IMAGE')) {
      return NextResponse.json({ success: false, error: 'JOB_RUNNING' }, { status: 409 })
    }

    const pricing = await getPricingConfig()
    const { sellPricePaise } = computeImageEditCost(numImages, resolution, pricing, sourceKeys.length)
    const creditPrice = aiSearchCreditPricePaise(pricing.aiExtraPaisePer1000)
    const aiCreditsRequired = Math.max(1, Math.ceil(sellPricePaise / creditPrice))
    const creditCheck = checkAiCreditsAvailable(studio, aiCreditsRequired, pricing.freeAiSearchCredits)
    if (!creditCheck.ok) {
      const divisor = pricing.momentsCreditDivisor
      const neededDisplay = toMomentsCredits(aiCreditsRequired, divisor)
      const leftDisplay = toMomentsCredits(Math.max(0, creditCheck.quotaCredits - creditCheck.usedCredits), divisor)
      return NextResponse.json({
        success: false, error: 'INSUFFICIENT_CREDITS',
        message: `This would need ${neededDisplay} Moments Credits — you have ${leftDisplay} left.`,
        data: creditCheck,
      }, { status: 402 })
    }

    if (!process.env.IMAGE_LAMBDA_ARN) {
      console.error('[moments ai-images POST] IMAGE_LAMBDA_ARN not set')
      return NextResponse.json({ success: false, error: 'NOT_CONFIGURED' }, { status: 503 })
    }

    try {
      await deductAiSearchCredits(studioId, aiCreditsRequired, creditCheck.quotaCredits)
    } catch (err) {
      console.error('[moments ai-images POST] credit deduction lost a concurrency race', err)
      return NextResponse.json({
        success: false, error: 'INSUFFICIENT_CREDITS',
        message: 'Someone just used the last of these credits — please check your balance and try again.',
      }, { status: 402 })
    }

    const imageId = randomUUID()
    const jobId = randomUUID()
    const now = new Date().toISOString()
    const ttl = Math.floor(Date.now() / 1000) + 24 * 60 * 60

    const aiImage: StudioAiImage = {
      imageId, jobId, studioId, projectId, mode,
      sourceFileIds, prompt, resolution, aspectRatio, numImages,
      provider: 'kling', status: 'generating', creditsCharged: aiCreditsRequired, createdAt: now,
    }
    await studioPutItem(TABLES.aiImages, aiImage as unknown as Record<string, unknown>)

    const job: StudioJob = {
      jobId, jobType: 'AI_IMAGE', status: 'PENDING', projectId, studioId,
      inputPayload: { imageId, mode, numImages }, createdAt: now, ttl,
    }
    await studioPutItem(TABLES.jobs, job as unknown as Record<string, unknown>)

    lambda.send(new InvokeCommand({
      FunctionName: process.env.IMAGE_LAMBDA_ARN,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify({
        jobId, imageId, studioId, projectId,
        mode, prompt: finalPrompt, sourceR2Keys: sourceKeys, resolution, aspectRatio, numImages,
        provider: pricing.imageProvider,
        r2Bucket: process.env.STUDIO_R2_ORIGINAL_BUCKET,
        r2Endpoint: process.env.STUDIO_R2_ENDPOINT,
        r2AccessKeyId: process.env.STUDIO_R2_ORIGINAL_ACCESS_KEY_ID,
        r2SecretAccessKey: process.env.STUDIO_R2_ORIGINAL_SECRET_ACCESS_KEY,
        klingApiKey: process.env.KLING_API_KEY,
        klingApiBaseUrl: process.env.KLING_API_BASE_URL || 'https://api-singapore.klingai.com',
        klingModelName: process.env.KLING_IMAGE_MODEL_NAME || 'kling-3.0-omni',
        // Lets the Lambda's own catch block refund directly if generation
        // fails cleanly (Kling never bills for a failed task).
        creditsCharged: aiCreditsRequired,
        refundPool: 'aiSearchCredits',
      })),
    })).catch(async (err: unknown) => {
      console.error('[moments ai-images POST] Lambda invoke failed', err)
      await refundAiSearchCredits(studioId, aiCreditsRequired)
      const failedAt = new Date().toISOString()
      await studioUpdateItem(TABLES.jobs, { jobId }, 'SET #s = :failed, errorMessage = :msg, completedAt = :now', { ':failed': 'FAILED', ':msg': 'Could not start generation', ':now': failedAt }, { '#s': 'status' })
      await studioUpdateItem(TABLES.aiImages, { imageId }, 'SET #s = :failed, errorMessage = :msg, completedAt = :now', { ':failed': 'failed', ':msg': 'Could not start generation', ':now': failedAt }, { '#s': 'status' })
    })

    return NextResponse.json({ success: true, data: { imageId, jobId, creditsCharged: aiCreditsRequired } })
  } catch (err) {
    console.error('[moments ai-images POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
