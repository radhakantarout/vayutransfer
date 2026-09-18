'use strict'

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { Upload } = require('@aws-sdk/lib-storage')
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb')
const { execFile } = require('child_process')
const fs = require('fs/promises')
const path = require('path')
const os = require('os')
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path

const REGION       = process.env.AWS_REGION || 'ap-south-1'
const JOBS_TABLE   = process.env.DYNAMO_STUDIO_JOBS_TABLE || 'vayustudio-jobs'
const REELS_TABLE  = process.env.DYNAMO_STUDIO_REELS_TABLE || 'vayustudio-reels'
const STUDIOS_TABLE = process.env.DYNAMO_STUDIO_STUDIOS_TABLE || 'vayustudio-studios'

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

// Refunds real ₹ credits directly from the Lambda's own catch block —
// before this, a job that failed cleanly (not stuck/timed-out) was NEVER
// refunded by anything: the Lambda itself didn't refund, and the daily cron
// sweep only catches jobs stuck in PENDING/PROCESSING past a timeout, never
// ones that already reached FAILED. `pool` mirrors lib/studio/billing.ts's
// two credit pools exactly (aiSearchCredits for Moments, reelCredits for
// Client Gallery/Guest) since this plain-JS Lambda can't import that TS file.
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Base preservation instructions (identity/clothing/no-hallucination) stay
// constant across every style — only the mood/motion fragment changes.
// Mirrors constants/videoProviders.ts#REEL_STYLE_META's promptFragment
// field, passed in per-invoke from the create-reel route rather than
// duplicated here, so the two never drift out of sync.
const BASE_PROMPT_SUFFIX = 'photorealistic motion, preserve facial identity, clothing and jewellery exactly, no additional people, no text, no logos, no artificial objects.'

// Text-to-video mode has no source photo to preserve identity/clothing FOR
// — appending BASE_PROMPT_SUFFIX's "preserve facial identity" instruction
// to a from-scratch generation would be meaningless and would just burn
// prompt-character budget for no reason. Lighter, generic quality guardrail
// instead.
const TEXT_TO_VIDEO_SUFFIX = 'high quality, smooth natural motion, no text, no watermark, no logos.'

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

// Text-to-video's own functions use this (not the pre-existing photo-mode
// fetches above, which don't need it) — image-to-video's real Kling-side
// duplicate-task rejection means a hung fetch there can only ever waste
// time, never double-charge. Text-to-video has NO such backstop (see
// createKlingTextToVideoTask's header below), so a request that hangs long
// enough to hit AWS's own 900s hard SIGKILL — which runs no JS at all, so
// the catch-and-refund block never executes — followed by AWS's automatic
// retry, could genuinely create a second real, separately-billed Kling
// video. A client-side timeout well under 900s turns that into an ordinary
// thrown error, which the surrounding try/catch already handles correctly
// (mark FAILED + refund) long before AWS's own timeout could ever fire.
async function fetchWithTimeout(url, options, timeoutMs = 30000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
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

// Kling text-to-video — CONFIRMED via a real API call against this account
// (2026-09-18), and genuinely different from image-to-video above in ways
// that are NOT obvious from Kling's own generic docs (which describe a
// single unified video endpoint where omitting image_url implies
// text-to-video — that is NOT how this account's API actually behaves):
//   - Real endpoint: POST {baseUrl}/text-to-video/{model} (confirmed
//     un-versioned, matching image-to-video's own convention) — a
//     genuinely SEPARATE endpoint, not image-to-video with first_frame
//     omitted (that combination returns a hard 400: "content item of type
//     'first_frame' is required").
//   - FLAT request body (prompt, external_task_id, ...) — NOT the nested
//     contents[]/settings{} shape image-to-video uses.
//   - `duration` and `resolution` are both silently accepted (no error) but
//     NOT actually respected — every real test produced an identical
//     ~5.04s clip and identical 4-unit charge regardless of the value sent.
//     Do not expose a duration/resolution choice in the UI for this mode;
//     it would be a lie.
//   - `aspect_ratio`/`negative_prompt`/`cfg_scale`/`camera_control` are all
//     accepted without error (real object-form camera_control tested too)
//     — passed through if the caller supplies them, but not required.
//   - CRITICAL: `external_task_id` gives NO create-time duplicate
//     protection here (confirmed: submitting the identical value twice
//     creates two separate, separately-billed real tasks — unlike
//     image-to-video, which correctly rejects a repeat with "already
//     exists"). The idempotency guard at the top of the handler (checking
//     OUR OWN job status before ever reaching this function) is therefore
//     the ONLY protection against a Lambda retry double-charging a
//     text-to-video generation — there is no Kling-side backstop to rely
//     on for this endpoint the way there is for image-to-video.
async function createKlingTextToVideoTask({ apiKey, baseUrl, modelName, prompt, externalTaskId, aspectRatio, negativePrompt, cfgScale, cameraControl }) {
  const body = { prompt, external_task_id: externalTaskId }
  if (aspectRatio) body.aspect_ratio = aspectRatio
  if (negativePrompt) body.negative_prompt = negativePrompt
  if (typeof cfgScale === 'number') body.cfg_scale = cfgScale
  if (cameraControl) body.camera_control = cameraControl

  const res = await fetchWithTimeout(`${baseUrl}/text-to-video/${modelName}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Kling text-to-video create failed for ${externalTaskId}: ${res.status} ${await res.text().catch(() => '')}`)
  const data = await res.json()
  if (data.code !== 0) throw new Error(`Kling text-to-video create returned error for ${externalTaskId}: ${data.code} ${data.message}`)
  return data.data.id // Kling's OWN task id — must be used for polling, external_task_id does not work as a query filter for this endpoint (confirmed: returns an empty array)
}

// Polls by Kling's own real task id (`task_ids=`), NOT `external_task_ids=`
// like queryKlingTasks above — confirmed the latter returns an empty result
// set for text-to-video tasks even though the exact same query style works
// for image-to-video. This is the single most easily-miswired part of this
// integration if copy-pasted from queryKlingTasks without noticing the
// param name changed.
async function queryKlingTasksByTaskId({ apiKey, baseUrl, taskIds }) {
  const res = await fetchWithTimeout(`${baseUrl}/tasks?task_ids=${encodeURIComponent(taskIds.join(','))}`, {
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

async function downloadToBuffer(url) {
  const res = await fetchWithTimeout(url, undefined, 60000)
  if (!res.ok) throw new Error(`Failed downloading video: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
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
    mode, // 'photo' (default, every existing caller) | 'text' — Moments only
    photos, durationSec, resolution,
    stylePromptFragment, targetDimensions,
    r2Bucket, r2Endpoint, r2AccessKeyId, r2SecretAccessKey,
    klingApiKey, klingApiBaseUrl, klingModelName,
    creditsCharged, refundPool,
    // Text-to-video only:
    textPrompt, aspectRatio, negativePrompt, cfgScale, cameraControl,
  } = event

  // Idempotency guard — AWS automatically retries a failed async ("Event")
  // Lambda invocation up to twice, with the EXACT SAME payload. Kling's own
  // external_task_id is permanently one-time-use per (reelId, fileId) — once
  // ANY task got created under it, a retry can only ever fail immediately
  // with "already exists", never actually retry the generation. Without
  // this guard that retry (a) overwrites the real failure reason with a
  // useless "already exists" error, and (b) would refund credits a SECOND
  // time once the catch block below does it correctly. If this job already
  // reached a terminal state, the retry is a pure no-op.
  const existingJob = await ddb.send(new GetCommand({ TableName: JOBS_TABLE, Key: { jobId }, ConsistentRead: true }))
  if (existingJob.Item && (existingJob.Item.status === 'READY' || existingJob.Item.status === 'FAILED')) {
    console.log(`[reelgen] SKIP jobId=${jobId} already terminal (status=${existingJob.Item.status}) — not retrying`)
    return
  }

  // Fallback matches constants/videoProviders.ts's own defaults, in case an
  // older client (or a manual test invoke) doesn't send these.
  const promptFragment = stylePromptFragment || 'cinematic film look, dramatic natural lighting, smooth deliberate camera movement'
  const dims = targetDimensions || { width: 1080, height: 1920 }

  if (mode === 'text') {
    console.log(`[reelgen] START (text-to-video) jobId=${jobId} reelId=${reelId}`)
    const r2Text = new S3Client({
      region: 'auto',
      endpoint: r2Endpoint,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
    })
    try {
      await updateJob(jobId, { status: 'PROCESSING', updatedAt: new Date().toISOString() })
      await updateReel(reelId, { status: 'generating', startedAt: new Date().toISOString() })
      await updateJob(jobId, { outputPayload: { stage: 'generating', processed: 0, total: 1 } })

      // reelId alone is enough for a unique externalTaskId here (unlike
      // photo mode's `${reelId}-${fileId}`, text mode never has more than
      // one task per reel) — kept anyway for readable CloudWatch logs, not
      // for uniqueness.
      const externalTaskId = `${reelId}-text`.slice(0, 64)
      const prompt = `${textPrompt}, ${TEXT_TO_VIDEO_SUFFIX}`
      const taskId = await createKlingTextToVideoTask({
        apiKey: klingApiKey, baseUrl: klingApiBaseUrl, modelName: klingModelName,
        prompt, externalTaskId, aspectRatio, negativePrompt, cfgScale, cameraControl,
      })

      // ~5.5 min ceiling at 8s/poll — real test calls completed in well
      // under a minute, this just gives headroom without holding the
      // Lambda open indefinitely on a stuck task.
      let result = null
      for (let attempt = 0; attempt < 40 && !result; attempt++) {
        if (attempt > 0) await sleep(8000)
        const queried = await queryKlingTasksByTaskId({ apiKey: klingApiKey, baseUrl: klingApiBaseUrl, taskIds: [taskId] })
        const t = queried.find((x) => x.id === taskId)
        if (t && (t.status === 'succeeded' || t.status === 'failed')) result = t
      }
      if (!result) throw new Error('Our AI video provider timed out — please try again')
      if (result.status !== 'succeeded') {
        throw new Error(`Our AI video provider couldn't generate this video: ${result.message || 'unknown reason'}`)
      }
      const video = (result.outputs || []).find((o) => o.type === 'video')
      if (!video?.url) throw new Error('Our AI video provider returned no video output')

      await updateJob(jobId, { outputPayload: { stage: 'finalizing', processed: 1, total: 1 } })
      const buffer = await downloadToBuffer(video.url)
      const finalKey = `studios/${studioId}/ai-reels/${reelId}/final.mp4`
      await new Upload({ client: r2Text, params: { Bucket: r2Bucket, Key: finalKey, Body: buffer, ContentType: 'video/mp4' } }).done()

      const now = new Date().toISOString()
      await updateJob(jobId, { status: 'READY', outputPayload: { stage: 'finalizing', processed: 1, total: 1, outputR2Key: finalKey }, completedAt: now })
      await updateReel(reelId, { status: 'completed', outputR2Key: finalKey, completedAt: now })
      console.log(`[reelgen] DONE (text-to-video) jobId=${jobId} reelId=${reelId}`)
    } catch (err) {
      console.error('[reelgen] ERROR (text-to-video):', err)
      const now = new Date().toISOString()
      await updateJob(jobId, { status: 'FAILED', errorMessage: String(err.message || err), completedAt: now }).catch(() => {})
      await updateReel(reelId, { status: 'failed', errorMessage: String(err.message || err), completedAt: now }).catch(() => {})
      await refundCredits(studioId, creditsCharged, refundPool).catch((e) => console.error('[reelgen] refund failed', e))
      throw err
    }
    return
  }

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
    // Kling's own per-clip failure reason (result.message, e.g. "Failure to
    // pass the risk control system") used to be discarded entirely — only
    // logged via console.warn, never surfaced anywhere a user could see it.
    // If nothing succeeds, this is what actually gets shown instead of a
    // generic "nothing to assemble" message.
    const failureReasons = []
    for (let i = 0; i < tasks.length; i++) {
      const result = results.get(tasks[i].externalTaskId)
      if (!result || result.status !== 'succeeded') {
        const reason = result?.message || (result ? 'unknown reason' : 'timed out waiting for a response')
        console.warn(`[reelgen] task ${tasks[i].externalTaskId} did not succeed (status=${result?.status ?? 'timeout'}): ${reason}`)
        failureReasons.push(reason)
        continue
      }
      const video = (result.outputs || []).find((o) => o.type === 'video')
      if (!video?.url) { console.warn(`[reelgen] task ${tasks[i].externalTaskId} succeeded but had no video output`); failureReasons.push('no video output'); continue }
      const clipPath = path.join(workDir, `clip-${i}.mp4`)
      await downloadToFile(video.url, clipPath)
      clipPaths.push(clipPath)
    }
    if (clipPaths.length === 0) {
      const uniqueReasons = [...new Set(failureReasons)]
      throw new Error(`Our AI video provider couldn't process ${tasks.length === 1 ? 'this photo' : 'these photos'}: ${uniqueReasons.join('; ')}`)
    }

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
    // Refund whatever this reel actually charged — Kling itself never bills
    // for a failed generation, so the studio shouldn't be charged either.
    // The idempotency guard above is what makes this safe to run exactly
    // once even across AWS's automatic async-invoke retries.
    await refundCredits(studioId, creditsCharged, refundPool).catch((e) => console.error('[reelgen] refund failed', e))
    throw err
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
