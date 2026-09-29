'use strict'

const { S3Client } = require('@aws-sdk/client-s3')
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

// Used by every Kling/network call in this file. A hung fetch rides out to
// AWS's own 900s hard SIGKILL otherwise (runs no JS at all, so the
// catch-and-refund block never executes) — a real production incident
// (2026-09-20/21) left a job stuck in PROCESSING for 24+ hours this way. A
// client-side timeout well under 900s turns any hang into an ordinary
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

async function downloadToFile(url, filePath) {
  const res = await fetchWithTimeout(url, undefined, 60000)
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
// One live mode only (as of Phase 6 of the async redesign, 2026-09-29):
// 'finalize' — every caller (Client Gallery, Guest, Moments photo-mode and
// text-to-video, reel-reclaim). Kling task creation and status polling
// already happened in the calling route + the periodic reel-check cron
// (via lib/studio/videoProviders/klingProvider.ts, now for both
// image-to-video and text-to-video); this Lambda is invoked only once every
// clip is known to have succeeded, and does purely download + (photo-mode)
// ffmpeg concat/crop + upload + mark-complete.
// The original single-invocation 'photo' pipeline (create + poll + download
// + concat + upload, all inside one Lambda call, up to 900s) was retired in
// Phase 5; the equivalent single-invocation 'text' pipeline was retired here
// in Phase 6, once Moments' text-to-video route also migrated to the split
// architecture — see the UNSUPPORTED-mode fallback at the bottom of this
// function for anything else that reaches this handler.
exports.handler = async (event) => {
  const {
    jobId, reelId, studioId,
    mode, // 'finalize' is the only live value — see handler comment above
    targetDimensions,
    r2Bucket, r2Endpoint, r2AccessKeyId, r2SecretAccessKey,
    creditsCharged, refundPool,
    // finalize only:
    clipUrls,
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

  // ─── finalize (2026-09-21) ────────────────────────────────────────────
  // Part of the async-redesign effort: task CREATION and STATUS POLLING
  // happen in the calling route + a periodic external check, see the
  // reelgen-async-redesign-plan memory — this Lambda is invoked ONLY once
  // every clip is already known to have succeeded, with their real URLs
  // already in hand. No Kling calls happen in this branch at all; it's
  // purely download + (photo-mode) ffmpeg concat/crop + upload +
  // mark-complete. Bounded by download+encode time only, not by however
  // long Kling takes to generate.
  //
  // `targetDimensions` presence is the discriminator: present = photo-style
  // (one or more clips, concat+crop via ffmpeg); absent = text-style
  // (exactly one clip, no crop, plain download+upload) — avoids a separate
  // mode-within-mode field since the two are already fully distinguished by
  // whether a crop/concat is needed at all.
  if (mode === 'finalize') {
    console.log(`[reelgen] START (finalize) jobId=${jobId} reelId=${reelId} clips=${clipUrls?.length}`)
    const r2Finalize = new S3Client({
      region: 'auto',
      endpoint: r2Endpoint,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
    })
    const finalizeWorkDir = targetDimensions ? await fs.mkdtemp(path.join(os.tmpdir(), 'reelgen-finalize-')) : null
    try {
      if (!Array.isArray(clipUrls) || clipUrls.length === 0) {
        throw new Error('finalize called with no clip URLs — nothing to assemble')
      }
      await updateJob(jobId, { outputPayload: { stage: 'finalizing', processed: 0, total: clipUrls.length } })

      let outputBuffer
      if (targetDimensions) {
        const clipPaths = []
        for (let i = 0; i < clipUrls.length; i++) {
          const clipPath = path.join(finalizeWorkDir, `clip-${i}.mp4`)
          await downloadToFile(clipUrls[i], clipPath)
          clipPaths.push(clipPath)
        }
        const listPath = path.join(finalizeWorkDir, 'list.txt')
        await fs.writeFile(listPath, clipPaths.map((p) => `file '${p}'`).join('\n'))
        const outputPath = path.join(finalizeWorkDir, 'output.mp4')
        const cropFilter = `scale=${targetDimensions.width}:${targetDimensions.height}:force_original_aspect_ratio=increase,crop=${targetDimensions.width}:${targetDimensions.height}`
        await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-vf', cropFilter, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outputPath])
        outputBuffer = await fs.readFile(outputPath)
      } else {
        if (clipUrls.length > 1) {
          console.warn(`[reelgen] finalize (text-style) received ${clipUrls.length} clip URLs but no targetDimensions — only clipUrls[0] is used, rest are discarded`)
        }
        outputBuffer = await downloadToBuffer(clipUrls[0])
      }

      await updateJob(jobId, { outputPayload: { stage: 'finalizing', processed: clipUrls.length, total: clipUrls.length } })
      const finalKey = `studios/${studioId}/ai-reels/${reelId}/final.mp4`
      await new Upload({ client: r2Finalize, params: { Bucket: r2Bucket, Key: finalKey, Body: outputBuffer, ContentType: 'video/mp4' } }).done()

      const now = new Date().toISOString()
      await updateJob(jobId, { status: 'READY', outputPayload: { stage: 'finalizing', processed: clipUrls.length, total: clipUrls.length, outputR2Key: finalKey }, completedAt: now })
      await updateReel(reelId, { status: 'completed', outputR2Key: finalKey, completedAt: now })
      console.log(`[reelgen] DONE (finalize) jobId=${jobId} reelId=${reelId}`)
    } catch (err) {
      console.error('[reelgen] ERROR (finalize):', err)
      const now = new Date().toISOString()
      await updateJob(jobId, { status: 'FAILED', errorMessage: String(err.message || err), completedAt: now }).catch(() => {})
      await updateReel(reelId, { status: 'failed', errorMessage: String(err.message || err), completedAt: now }).catch(() => {})
      await refundCredits(studioId, creditsCharged, refundPool).catch((e) => console.error('[reelgen] refund failed', e))
      throw err
    } finally {
      if (finalizeWorkDir) await fs.rm(finalizeWorkDir, { recursive: true, force: true }).catch(() => {})
    }
    return
  }

  // Legacy 'photo' (Phase 5) and 'text' (Phase 6) full-pipeline modes are
  // both retired — every caller (Client Gallery, Guest, Moments photo-mode
  // and text-to-video) now creates Kling tasks in its own route
  // (lib/studio/videoProviders/) and invokes this Lambda only in
  // mode:'finalize', once every clip is already known to have succeeded.
  // Any invocation reaching here is unexpected (a stray old client, a
  // manual test with a stale payload, etc.) — fail loudly with a clear
  // error and refund, rather than silently returning without doing
  // anything, which would leave the job stuck forever with no trace of why.
  console.error(`[reelgen] UNSUPPORTED mode="${mode}" jobId=${jobId} reelId=${reelId} — legacy photo/text pipelines were retired`)
  const now = new Date().toISOString()
  const errorMessage = `Unsupported mode: ${mode}`
  await updateJob(jobId, { status: 'FAILED', errorMessage, completedAt: now }).catch(() => {})
  await updateReel(reelId, { status: 'failed', errorMessage, completedAt: now }).catch(() => {})
  await refundCredits(studioId, creditsCharged, refundPool).catch((e) => console.error('[reelgen] refund failed', e))
  throw new Error(errorMessage)
}
