'use strict'

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { Upload } = require('@aws-sdk/lib-storage')
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb')

const REGION = process.env.AWS_REGION || 'ap-south-1'
const JOBS_TABLE = process.env.DYNAMO_STUDIO_JOBS_TABLE || 'vayustudio-jobs'
const AI_IMAGES_TABLE = process.env.DYNAMO_STUDIO_AI_IMAGES_TABLE || 'vayustudio-ai-images'

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }))

// Config-driven provider swap (lib/pricingConfig.ts's imageProvider field) —
// adding a real second provider is: write providers/openai.js exporting the
// same `generate(...)` shape, add one line here, add 'openai' to
// IMAGE_PROVIDERS in lib/pricingConfig.ts. Nothing else in this file, the
// calling routes, or the UI needs to change.
const providers = {
  kling: require('./providers/kling'),
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

async function downloadToBuffer(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed downloading generated image: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
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
    mode, prompt, sourceR2Keys, resolution, aspectRatio, numImages,
    provider,
    r2Bucket, r2Endpoint, r2AccessKeyId, r2SecretAccessKey,
    klingApiKey, klingApiBaseUrl, klingModelName,
  } = event

  console.log(`[imagegen] START jobId=${jobId} imageId=${imageId} mode=${mode} provider=${provider} refs=${(sourceR2Keys || []).length} numImages=${numImages}`)

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

    // Presign source photos here (not in the route) — same reasoning as
    // reelgen: a URL minted at request time could be stale by the time this
    // fire-and-forget invoke actually runs under queueing/cold-start delay.
    const sourceImageUrls = await Promise.all(
      (sourceR2Keys || []).map((key) => getSignedUrl(r2, new GetObjectCommand({ Bucket: r2Bucket, Key: key }), { expiresIn: 3600 }))
    )

    const impl = providers[provider] || providers.kling
    const resultUrls = await impl.generate({
      prompt, sourceImageUrls, resolution, aspectRatio, numImages,
      apiKey: klingApiKey, baseUrl: klingApiBaseUrl, modelName: klingModelName,
      externalTaskId: `${imageId}`.slice(0, 64),
    })

    await updateJob(jobId, { outputPayload: { stage: 'uploading', processed: 0, total: resultUrls.length } })
    const r2Keys = []
    const sizes = []
    for (let i = 0; i < resultUrls.length; i++) {
      const buffer = await downloadToBuffer(resultUrls[i])
      const key = `studios/${studioId}/ai-images/${imageId}/output-${i}.jpg`
      await new Upload({
        client: r2,
        params: { Bucket: r2Bucket, Key: key, Body: buffer, ContentType: 'image/jpeg' },
      }).done()
      r2Keys.push(key)
      sizes.push(buffer.length)
      await updateJob(jobId, { outputPayload: { stage: 'uploading', processed: i + 1, total: resultUrls.length } })
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
    throw err
  }
}
