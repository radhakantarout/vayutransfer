'use strict'

const { S3Client } = require('@aws-sdk/client-s3')
const { Upload } = require('@aws-sdk/lib-storage')
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb')

const REGION = process.env.AWS_REGION || 'ap-south-1'
const JOBS_TABLE = process.env.DYNAMO_STUDIO_JOBS_TABLE || 'vayustudio-jobs'
const AI_IMAGES_TABLE = process.env.DYNAMO_STUDIO_AI_IMAGES_TABLE || 'vayustudio-ai-images'
const STUDIOS_TABLE = process.env.DYNAMO_STUDIO_STUDIOS_TABLE || 'vayustudio-studios'

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }))

// Config-driven provider swap (lib/pricingConfig.ts's imageProvider field).
// 'openai' (gpt-image-2.5-sunburst) is the PRIMARY provider as of
// 2026-09-20 — Kling's edit path never faithfully preserved input photo
// identity even after its own request-schema fix, confirmed via real
// visual comparison (see providers/kling.js's header). Kling stays
// available/selectable for generate-mode or a future rollback.
const providers = {
  kling: require('./providers/kling'),
  openai: require('./providers/openai'),
}

process.on('unhandledRejection', (reason) => console.error('[imagegen] UNHANDLED REJECTION:', reason && reason.stack ? reason.stack : reason))
process.on('uncaughtException', (err) => console.error('[imagegen] UNCAUGHT EXCEPTION:', err && err.stack ? err.stack : err))

async function updateJob(jobId, patch) {
  const entries = Object.entries(patch)
  const names = Object.fromEntries(entries.map(([k], i) => [`#k${i}`, k]))
  const sets  = entries.map((_, i) => `#k${i} = :v${i}`).join(', ')
  const vals  = Object.fromEntries(entries.map(([, v], i) => [`:v${i}`, v]))
  await ddb.send(new UpdateCommand({ TableName: JOBS_TABLE, Key: { jobId }, UpdateExpression: `SET ${sets}`, ExpressionAttributeNames: names, ExpressionAttributeValues: vals }))
}

async function updateAiImage(imageId, patch) {
  const entries = Object.entries(patch)
  const names = Object.fromEntries(entries.map(([k], i) => [`#k${i}`, k]))
  const sets  = entries.map((_, i) => `#k${i} = :v${i}`).join(', ')
  const vals  = Object.fromEntries(entries.map(([, v], i) => [`:v${i}`, v]))
  await ddb.send(new UpdateCommand({ TableName: AI_IMAGES_TABLE, Key: { imageId }, UpdateExpression: `SET ${sets}`, ExpressionAttributeNames: names, ExpressionAttributeValues: vals }))
}

// Refunds real ₹ credits directly from the Lambda's own catch block — a
// job that fails cleanly (not stuck/timed-out) was never refunded by
// anything before this: the daily cron sweep only catches jobs stuck in
// PENDING/PROCESSING past a timeout, never ones that already reached
// FAILED. Only 'aiSearchCredits' exists today (Moments is this Lambda's
// only caller), kept as an explicit pool name (not hardcoded) so a future
// non-Moments caller (mirroring reelgen's Client Gallery/Guest split)
// doesn't need this function's shape to change.
async function refundCredits(studioId, credits, pool) {
  if (!studioId || !credits || !pool) return
  const now = new Date().toISOString()
  if (pool === 'aiSearchCredits') {
    await ddb.send(new UpdateCommand({
      TableName: STUDIOS_TABLE, Key: { studioId },
      UpdateExpression: 'ADD aiSearchCreditsUsed :n SET updatedAt = :now',
      ConditionExpression: 'attribute_exists(aiSearchCreditsUsed) AND aiSearchCreditsUsed >= :credits',
      ExpressionAttributeValues: { ':n': -credits, ':now': now, ':credits': credits },
    }))
  } else if (pool === 'reelCredits') {
    await ddb.send(new UpdateCommand({
      TableName: STUDIOS_TABLE, Key: { studioId },
      UpdateExpression: 'ADD reelCreditsBalance :credits SET updatedAt = :now',
      ExpressionAttributeValues: { ':credits': credits, ':now': now },
    }))
  }
}

// ─── Lambda handler ──────────────────────────────────────────────────────────
// Sibling to vayustudio-reelgen's shape (fire-and-forget invoke, R2/API
// creds arrive per-invoke, raw UpdateCommand job/record updates) but
// simpler — a single async provider task+poll, no ffmpeg/video-assembly
// step. Every generated image is uploaded to a STAGING R2 location and
// recorded as plain keys on the StudioAiImage row, NOT MediaFile rows —
// generation is billed regardless (the credit deduction already happened
// before this Lambda was invoked), but storage should only count for images
// the user actually keeps. A separate route (ai-images/[imageId]/save)
// promotes the chosen subset into real MediaFile rows later.
exports.handler = async (event) => {
  const {
    jobId, imageId, studioId, projectId,
    mode, prompt, sourceImageUrls, resolution, aspectRatio, numImages,
    provider,
    r2Bucket, r2Endpoint, r2AccessKeyId, r2SecretAccessKey,
    klingApiKey, klingApiBaseUrl, openaiApiKey,
    creditsCharged, refundPool,
  } = event

  // Idempotency guard — AWS automatically retries a failed async ("Event")
  // Lambda invocation up to twice, with the EXACT SAME payload. Kling's own
  // external_task_id is permanently one-time-use per imageId — once a task
  // got created under it, a retry can only fail immediately with "already
  // exists", never actually retry the generation. Without this guard that
  // retry overwrites the real failure reason and would refund credits a
  // SECOND time once the catch block below does it correctly. See
  // lambda/vayustudio-reelgen/index.js's identical guard for the full story
  // (found via a real production incident, 2026-09-18).
  const existingJob = await ddb.send(new GetCommand({ TableName: JOBS_TABLE, Key: { jobId } }))
  if (existingJob.Item && (existingJob.Item.status === 'READY' || existingJob.Item.status === 'FAILED')) {
    console.log(`[imagegen] SKIP jobId=${jobId} already terminal (status=${existingJob.Item.status}) — not retrying`)
    return
  }

  console.log(`[imagegen] START jobId=${jobId} imageId=${imageId} mode=${mode} provider=${provider} refs=${(sourceImageUrls || []).length} numImages=${numImages}`)

  const r2 = new S3Client({
    region: 'auto',
    endpoint: r2Endpoint,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
  })

  try {
    await updateJob(jobId, { status: 'PROCESSING', updatedAt: new Date().toISOString() })
    await updateAiImage(imageId, { status: 'generating' })
    // Unlike reelgen (one Kling task per photo, real per-photo progress),
    // image generation is a SINGLE task producing the whole batch — this is
    // the only "generating" progress point there is until it resolves.
    await updateJob(jobId, { outputPayload: { stage: 'generating', processed: 0, total: 1 } })

    // sourceImageUrls are already real, publicly-fetchable preview URLs
    // (the route sends r2PreviewUrl, not a raw R2 key) — no presigning
    // needed here at all, unlike before 2026-09-20. Real production
    // failure found that OpenAI rejected raw originals with "Invalid image
    // file or mode" for perfectly normal photos (likely a phone/app
    // encoding quirk); the preview is always a full re-encode into a
    // standard JPEG (lambda/vayustudio-watermark/index.js, sharp, Q82,
    // capped at 1200px) regardless of the original's format, which
    // normalizes this away. See the ai-images route's own comment on this.
    const impl = providers[provider] || providers.openai
    // No modelName passed through — each provider hardcodes its own real
    // confirmed model internally (kling.js: 'kling-v2-1' for edits; openai.js:
    // 'gpt-image-2.5-sunburst') since real API testing found previously
    // env-configurable values were never actually valid — see each
    // provider's own header for the full story.
    // apiKey is provider-specific: kling.js needs {apiKey, baseUrl},
    // openai.js only needs {apiKey} (baseUrl is hardcoded, no per-account
    // base URL concept for OpenAI the way Kling has regional endpoints).
    const resultBuffers = await impl.generate({
      prompt, sourceImageUrls, resolution, aspectRatio, numImages,
      apiKey: provider === 'kling' ? klingApiKey : openaiApiKey,
      baseUrl: klingApiBaseUrl,
      externalTaskId: `${imageId}`.slice(0, 64),
    })

    await updateJob(jobId, { outputPayload: { stage: 'uploading', processed: 0, total: resultBuffers.length } })
    const r2Keys = []
    const sizes = []
    for (let i = 0; i < resultBuffers.length; i++) {
      const buffer = resultBuffers[i]
      const key = `studios/${studioId}/ai-images/${imageId}/output-${i}.jpg`
      await new Upload({
        client: r2,
        params: { Bucket: r2Bucket, Key: key, Body: buffer, ContentType: 'image/jpeg' },
      }).done()
      r2Keys.push(key)
      sizes.push(buffer.length)
      await updateJob(jobId, { outputPayload: { stage: 'uploading', processed: i + 1, total: resultBuffers.length } })
    }
    if (r2Keys.length === 0) throw new Error('No images generated successfully — nothing to save')

    const now = new Date().toISOString()
    await updateJob(jobId, { status: 'READY', outputPayload: { stage: 'finalizing', processed: r2Keys.length, total: r2Keys.length }, completedAt: now })
    await updateAiImage(imageId, { status: 'completed', outputR2Keys: r2Keys, outputSizes: sizes, completedAt: now })

    console.log(`[imagegen] DONE jobId=${jobId} imageId=${imageId} images=${r2Keys.length}`)
  } catch (err) {
    console.error('[imagegen] ERROR:', err)
    const now = new Date().toISOString()
    await updateJob(jobId, { status: 'FAILED', errorMessage: String(err.message || err), completedAt: now }).catch(() => {})
    await updateAiImage(imageId, { status: 'failed', errorMessage: String(err.message || err), completedAt: now }).catch(() => {})
    // Refund whatever this generation actually charged — Kling itself never
    // bills for a failed generation, so the studio shouldn't be charged
    // either. The idempotency guard above is what makes this safe to run
    // exactly once even across AWS's automatic async-invoke retries.
    await refundCredits(studioId, creditsCharged, refundPool).catch((e) => console.error('[imagegen] refund failed', e))
    throw err
  }
}
