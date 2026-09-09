'use strict'

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { Upload } = require('@aws-sdk/lib-storage')
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb')
const { execFile } = require('child_process')
const fs = require('fs/promises')
const path = require('path')
const os = require('os')
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path

const REGION      = process.env.AWS_REGION || 'ap-south-1'
const JOBS_TABLE  = process.env.DYNAMO_STUDIO_JOBS_TABLE || 'vayustudio-jobs'
const REELS_TABLE = process.env.DYNAMO_STUDIO_REELS_TABLE || 'vayustudio-reels'

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }))

process.on('unhandledRejection', (reason) => console.error('[reelgen] UNHANDLED REJECTION:', reason && reason.stack ? reason.stack : reason))
process.on('uncaughtException', (err) => console.error('[reelgen] UNCAUGHT EXCEPTION:', err && err.stack ? err.stack : err))

async function updateJob(jobId, patch) {
  const entries = Object.entries(patch)
  const names = Object.fromEntries(entries.map(([k], i) => [`#k${i}`, k]))
  const sets  = entries.map((_, i) => `#k${i} = :v${i}`).join(', ')
  const vals  = Object.fromEntries(entries.map(([, v], i) => [`:v${i}`, v]))
  await ddb.send(new UpdateCommand({ TableName: JOBS_TABLE, Key: { jobId }, UpdateExpression: `SET ${sets}`, ExpressionAttributeNames: names, ExpressionAttributeValues: vals }))
}

async function updateReel(reelId, patch) {
  const entries = Object.entries(patch)
  const names = Object.fromEntries(entries.map(([k], i) => [`#k${i}`, k]))
  const sets  = entries.map((_, i) => `#k${i} = :v${i}`).join(', ')
  const vals  = Object.fromEntries(entries.map(([, v], i) => [`:v${i}`, v]))
  await ddb.send(new UpdateCommand({ TableName: REELS_TABLE, Key: { reelId }, UpdateExpression: `SET ${sets}`, ExpressionAttributeNames: names, ExpressionAttributeValues: vals }))
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Base preservation instructions (identity/clothing/no-hallucination) stay
// constant across every style — only the mood/motion fragment changes.
// Mirrors constants/videoProviders.ts#REEL_STYLE_META's promptFragment
// field, passed in per-invoke from the create-reel route rather than
// duplicated here, so the two never drift out of sync.
const BASE_PROMPT_SUFFIX = 'photorealistic motion, preserve facial identity, clothing and jewellery exactly, no additional people, no text, no logos, no artificial objects.'

// One Kling image-to-video task per selected photo. Confirmed request/
// response contract (lib/studio/videoProviders/klingProvider.ts, same file
// header has the full history of how this was confirmed against a real
// live account — this Lambda duplicates that logic in plain JS rather than
// importing it, since Lambdas in this codebase are self-contained JS
// packages, never sharing code with the Next.js TS app).
async function createKlingTask({ apiKey, baseUrl, modelName, imageUrl, externalTaskId, durationSec, resolution, stylePromptFragment }) {
  const prompt = `${stylePromptFragment}, ${BASE_PROMPT_SUFFIX}`
  const res = await fetch(`${baseUrl}/image-to-video/${modelName}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        { type: 'prompt', text: prompt },
        { type: 'first_frame', url: imageUrl },
      ],
      settings: { resolution, duration: durationSec },
      options: { external_task_id: externalTaskId, watermark_info: { enabled: false } },
    }),
  })
  if (!res.ok) throw new Error(`Kling create failed for ${externalTaskId}: ${res.status} ${await res.text().catch(() => '')}`)
  const data = await res.json()
  if (data.code !== 0) throw new Error(`Kling create returned error for ${externalTaskId}: ${data.code} ${data.message}`)
  return data.data.id
}

async function queryKlingTasks({ apiKey, baseUrl, externalTaskIds }) {
  const res = await fetch(`${baseUrl}/tasks?external_task_ids=${encodeURIComponent(externalTaskIds.join(','))}`, {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Kling query failed: ${res.status} ${await res.text().catch(() => '')}`)
  const data = await res.json()
  if (data.code !== 0) throw new Error(`Kling query returned error: ${data.code} ${data.message}`)
  return data.data // array
}

async function downloadToFile(url, filePath) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed downloading clip: ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await fs.writeFile(filePath, buf)
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { maxBuffer: 1024 * 1024 * 32 }, (err, stdout, stderr) => {
      if (err) { err.stderr = stderr; return reject(err) }
      resolve({ stdout, stderr })
    })
  })
}

// ─── Lambda handler ──────────────────────────────────────────────────────────
// MVP scope (design doc's "fast minimal demo" path): every selected photo
// becomes a Kling AI clip (no FFmpeg Ken Burns fallback, no hybrid
// hero-clip selection, no story planning, no transitions/music) — simple
// concat of N Kling clips in the order they were selected. Real hybrid
// generation is a later pass once this end-to-end path is proven.
//
// Payload built by the create-reel API route (client gallery): a
// pre-resolved list of {fileId, filename, key} for R2-backed photos only —
// this MVP does not support S3-backed (pre-R2-migration) photos, since
// every studio has already been migrated (see CLAUDE.md R2 migration notes).
exports.handler = async (event) => {
  const {
    jobId, reelId, studioId,
    photos, durationSec, resolution,
    stylePromptFragment, targetDimensions,
    r2Bucket, r2Endpoint, r2AccessKeyId, r2SecretAccessKey,
    klingApiKey, klingApiBaseUrl, klingModelName,
  } = event

  // Fallback matches constants/videoProviders.ts's own defaults, in case an
  // older client (or a manual test invoke) doesn't send these.
  const promptFragment = stylePromptFragment || 'cinematic film look, dramatic natural lighting, smooth deliberate camera movement'
  const dims = targetDimensions || { width: 1080, height: 1920 }

  console.log(`[reelgen] START jobId=${jobId} reelId=${reelId} photos=${photos?.length}`)

  const r2 = new S3Client({
    region: 'auto',
    endpoint: r2Endpoint,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
  })

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reelgen-'))

  try {
    await updateJob(jobId, { status: 'PROCESSING', updatedAt: new Date().toISOString() })
    await updateReel(reelId, { status: 'generating', startedAt: new Date().toISOString() })

    // 1. Presign each source photo (Kling needs a plain fetchable HTTPS URL,
    //    it cannot take R2 credentials or embedded bytes) and submit one
    //    Kling task per photo, sequentially (MVP scale is a handful of
    //    photos — no concurrency limiting needed yet).
    const tasks = []
    for (const p of photos) {
      const imageUrl = await getSignedUrl(r2, new GetObjectCommand({ Bucket: r2Bucket, Key: p.key }), { expiresIn: 3600 })
      const externalTaskId = `${reelId}-${p.fileId}`.slice(0, 64)
      await createKlingTask({ apiKey: klingApiKey, baseUrl: klingApiBaseUrl, modelName: klingModelName, imageUrl, externalTaskId, durationSec, resolution, stylePromptFragment: promptFragment })
      tasks.push({ fileId: p.fileId, externalTaskId })
    }
    await updateJob(jobId, { outputPayload: { stage: 'generating', processed: 0, total: tasks.length } })

    // 2. Poll until every task reaches succeeded/failed, or we give up.
    //    ~10 min ceiling at 8s/poll — well inside the Lambda's 900s limit
    //    even after clip download + ffmpeg assembly.
    const results = new Map()
    for (let attempt = 0; attempt < 75 && results.size < tasks.length; attempt++) {
      if (attempt > 0) await sleep(8000)
      const pendingIds = tasks.filter((t) => !results.has(t.externalTaskId)).map((t) => t.externalTaskId)
      const queried = await queryKlingTasks({ apiKey: klingApiKey, baseUrl: klingApiBaseUrl, externalTaskIds: pendingIds })
      for (const t of queried) {
        if (t.status === 'succeeded' || t.status === 'failed') results.set(t.external_id, t)
      }
      await updateJob(jobId, { outputPayload: { stage: 'generating', processed: results.size, total: tasks.length } })
    }

    // 3. Download every successfully-generated clip. A photo that failed or
    //    never finished is simply dropped from the reel — MVP has no
    //    partial-failure UI, we just do our best with what succeeded.
    await updateJob(jobId, { outputPayload: { stage: 'assembling', processed: 0, total: tasks.length } })
    const clipPaths = []
    for (let i = 0; i < tasks.length; i++) {
      const result = results.get(tasks[i].externalTaskId)
      if (!result || result.status !== 'succeeded') {
        console.warn(`[reelgen] task ${tasks[i].externalTaskId} did not succeed (status=${result?.status ?? 'timeout'}), skipping`)
        continue
      }
      const video = (result.outputs || []).find((o) => o.type === 'video')
      if (!video?.url) { console.warn(`[reelgen] task ${tasks[i].externalTaskId} succeeded but had no video output`); continue }
      const clipPath = path.join(workDir, `clip-${i}.mp4`)
      await downloadToFile(video.url, clipPath)
      clipPaths.push(clipPath)
    }
    if (clipPaths.length === 0) throw new Error('No Kling clips generated successfully — nothing to assemble')

    // 4. Concat via ffmpeg's concat demuxer, re-encoding (not `-c copy`) since
    //    Kling clip codec params aren't guaranteed identical across calls —
    //    simple concat only, no transitions/music yet (later pass). Kling's
    //    confirmed API has no aspect_ratio request field at all (see
    //    klingProvider.ts's header), so hitting the client's chosen
    //    template (Instagram/Shorts/Facebook) means cropping HERE, in the
    //    final encode, not something Kling does for us — scale-then-crop
    //    (not just scale) so the output always exactly fills the target
    //    frame regardless of each clip's own native aspect ratio.
    const listPath = path.join(workDir, 'list.txt')
    await fs.writeFile(listPath, clipPaths.map((p) => `file '${p}'`).join('\n'))
    const outputPath = path.join(workDir, 'output.mp4')
    const cropFilter = `scale=${dims.width}:${dims.height}:force_original_aspect_ratio=increase,crop=${dims.width}:${dims.height}`
    await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-vf', cropFilter, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outputPath])

    // 5. Upload the final video to R2.
    await updateJob(jobId, { outputPayload: { stage: 'finalizing', processed: clipPaths.length, total: tasks.length } })
    const finalKey = `studios/${studioId}/ai-reels/${reelId}/final.mp4`
    const outputBuffer = await fs.readFile(outputPath)
    await new Upload({
      client: r2,
      params: { Bucket: r2Bucket, Key: finalKey, Body: outputBuffer, ContentType: 'video/mp4' },
    }).done()

    // Store the durable R2 KEY, not a presigned URL — the video lives in R2
    // indefinitely (same bucket/lifecycle as gallery originals), but any
    // presigned URL baked in now would go dead after its expiry window even
    // though the file itself is still there. The client-gallery status
    // route mints a fresh URL from this key on every read instead.
    const now = new Date().toISOString()
    await updateJob(jobId, { status: 'READY', outputPayload: { stage: 'finalizing', processed: clipPaths.length, total: tasks.length, outputR2Key: finalKey }, completedAt: now })
    await updateReel(reelId, { status: 'completed', outputR2Key: finalKey, completedAt: now })

    console.log(`[reelgen] DONE jobId=${jobId} reelId=${reelId} clips=${clipPaths.length}/${tasks.length}`)
  } catch (err) {
    console.error('[reelgen] ERROR:', err)
    const now = new Date().toISOString()
    await updateJob(jobId, { status: 'FAILED', errorMessage: String(err.message || err), completedAt: now }).catch(() => {})
    await updateReel(reelId, { status: 'failed', errorMessage: String(err.message || err), completedAt: now }).catch(() => {})
    throw err
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
