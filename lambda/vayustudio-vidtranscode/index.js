'use strict'

const { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')
const { Upload }                                        = require('@aws-sdk/lib-storage')
const { DynamoDBClient }                                = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, UpdateCommand }         = require('@aws-sdk/lib-dynamodb')
const { execFile }   = require('child_process')
const { pipeline }   = require('stream/promises')
const fsSync         = require('fs')
const fs             = require('fs/promises')
const path           = require('path')
const os             = require('os')
const ffmpegPath     = require('@ffmpeg-installer/ffmpeg').path

const REGION       = process.env.AWS_REGION ?? 'ap-south-1'
const DYNAMO_TABLE = process.env.DYNAMO_TABLE ?? 'vayustudio-mediafiles'
const JOBS_TABLE   = process.env.DYNAMO_STUDIO_JOBS_TABLE ?? 'vayustudio-jobs'
const PREVIEW_BASE = (process.env.PREVIEW_BASE_URL ?? 'https://previews-test.test.vayutransfer.com').replace(/\/$/, '')

// Real event-video clips from a phone are almost always well under this —
// generous ceiling to keep the Lambda's /tmp + 900s runtime safe rather than
// silently timing out on something huge. Rejected cleanly (FAILED, logged
// reason) rather than attempted.
const MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024 // 2GB

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }))

// setStatus/bumpJobProgress are intentionally identical to
// lambda/vayustudio-watermark/index.js's own copies (same tables, same
// shape) — Lambdas in this codebase are self-contained JS packages that
// never share code with each other or the Next.js app, so this is a
// deliberate copy, not drift.
async function setStatus(projectId, fileId, status, extra = {}) {
  const now   = new Date().toISOString()
  const vals  = { ':s': status, ':now': now }
  const parts = ['processingStatus = :s', 'updatedAt = :now']

  Object.entries(extra).forEach(([k, v]) => {
    const safe = k.replace(/[^a-zA-Z0-9]/g, '_')
    parts.push(`${k} = :${safe}`)
    vals[`:${safe}`] = v
  })

  await ddb.send(new UpdateCommand({
    TableName: DYNAMO_TABLE,
    Key: { projectId, fileId },
    UpdateExpression: `SET ${parts.join(', ')}`,
    ExpressionAttributeValues: vals,
  }))
}

async function bumpJobProgress(jobId) {
  if (!jobId) return
  try {
    const result = await ddb.send(new UpdateCommand({
      TableName: JOBS_TABLE,
      Key: { jobId },
      UpdateExpression: 'ADD outputPayload.#processed :one',
      ExpressionAttributeNames: { '#processed': 'processed' },
      ExpressionAttributeValues: { ':one': 1 },
      ReturnValues: 'ALL_NEW',
    }))
    const out = result.Attributes?.outputPayload
    if (out && typeof out.processed === 'number' && typeof out.total === 'number' && out.processed >= out.total) {
      await ddb.send(new UpdateCommand({
        TableName: JOBS_TABLE,
        Key: { jobId },
        UpdateExpression: 'SET #s = :ready, completedAt = :now',
        ConditionExpression: '#s = :processing',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':ready': 'READY', ':now': new Date().toISOString(), ':processing': 'PROCESSING' },
      })).catch(() => {})
    }
  } catch (err) {
    console.error('[vidtranscode] bumpJobProgress failed:', err)
  }
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { maxBuffer: 1024 * 1024 * 32 }, (err, stdout, stderr) => {
      if (err) { err.stderr = stderr; return reject(err) }
      resolve({ stdout, stderr })
    })
  })
}

// Converts whatever raw video a phone produced (very commonly HEVC-in-.mov
// from an iPhone, which only Safari can decode) into universally-playable
// H.264/AAC mp4, capped at 1080p so a 4K source doesn't blow past the
// Lambda's time/disk budget. Written through the exact same r2PreviewUrl
// field + public-domain URL construction the watermark Lambda already uses
// for images — the read side needs no changes at all, it already prefers
// r2PreviewUrl once set.
exports.handler = async (event) => {
  console.log('[vidtranscode] start', JSON.stringify({
    ...event,
    r2SecretAccessKey: event.r2SecretAccessKey ? '[REDACTED]' : undefined,
    sourceR2SecretAccessKey: event.sourceR2SecretAccessKey ? '[REDACTED]' : undefined,
  }))

  const {
    fileId, projectId,
    sourceR2Bucket, sourceR2Endpoint, sourceR2AccessKeyId, sourceR2SecretAccessKey, sourceKey,
    r2Bucket, r2Key, r2Endpoint, r2AccessKeyId, r2SecretAccessKey,
    jobId,
  } = event

  if (!fileId || !projectId || !sourceKey) {
    console.error('[vidtranscode] missing required fields')
    return { statusCode: 400, body: 'Missing required fields' }
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vidtranscode-'))
  const inputPath  = path.join(workDir, 'input')
  const outputPath = path.join(workDir, 'output.mp4')
  const thumbPath  = path.join(workDir, 'thumb.jpg')

  try {
    const sourceR2 = new S3Client({
      region: 'auto',
      endpoint: sourceR2Endpoint,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      credentials: { accessKeyId: sourceR2AccessKeyId, secretAccessKey: sourceR2SecretAccessKey },
    })

    // ── 1. Size gate before downloading anything ─────────────────────────
    const head = await sourceR2.send(new HeadObjectCommand({ Bucket: sourceR2Bucket, Key: sourceKey }))
    if ((head.ContentLength ?? 0) > MAX_SOURCE_BYTES) {
      throw new Error(`Video too large to transcode (${head.ContentLength} bytes, cap is ${MAX_SOURCE_BYTES})`)
    }

    // ── 2. Stream the original down to /tmp (not buffered in memory — real
    // event videos can be large even under the cap above) ────────────────
    console.log(`[vidtranscode] downloading r2://${sourceR2Bucket}/${sourceKey}`)
    const sourceObj = await sourceR2.send(new GetObjectCommand({ Bucket: sourceR2Bucket, Key: sourceKey }))
    await pipeline(sourceObj.Body, fsSync.createWriteStream(inputPath))

    // ── 3. Transcode — H.264/AAC, capped at 1080p, faststart for streaming ─
    // -map is required, not cosmetic: newer iPhones (e.g. spatial-audio
    // recordings) embed a second audio track in Apple's proprietary "apac"
    // codec alongside the normal stereo AAC track. ffmpeg's default stream
    // auto-selection picks "best" audio by channel count and grabs the
    // undecodable apac track instead, failing the whole command. Mapping
    // the first video + first audio stream by relative index sidesteps
    // that — the trailing `?` makes the audio map optional so silent/
    // video-only source files still succeed.
    console.log('[vidtranscode] running ffmpeg')
    await runFfmpeg([
      '-y', '-i', inputPath,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-vf', "scale='min(1920,iw)':-2",
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      outputPath,
    ])
    const { size: outputSize } = await fs.stat(outputPath)
    console.log(`[vidtranscode] transcoded, output ${outputSize} bytes`)

    // ── 3b. Grab a static poster frame from the (already scaled/oriented)
    // transcoded output — grid tiles show this as a plain <img>, exactly
    // like a photo, instead of ever mounting a <video> element. Frame 0
    // rather than e.g. 0.5s in, so this never fails on a very short clip.
    await runFfmpeg(['-y', '-i', outputPath, '-ss', '00:00:00', '-vframes', '1', '-q:v', '3', thumbPath])
    const thumbBuf = await fs.readFile(thumbPath)
    console.log(`[vidtranscode] thumbnail grabbed, ${thumbBuf.length} bytes`)

    // ── 4. Upload the transcoded mp4 (streamed — real videos can be large
    // even under the source cap) + the small thumbnail jpg to R2 ──────────
    const destR2 = new S3Client({
      region: 'auto',
      endpoint: r2Endpoint,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
    })
    await new Upload({
      client: destR2,
      params: {
        Bucket: r2Bucket,
        Key: r2Key,
        Body: fsSync.createReadStream(outputPath),
        ContentType: 'video/mp4',
        CacheControl: 'public, max-age=31536000, immutable',
      },
    }).done()
    console.log(`[vidtranscode] uploaded video to R2: ${r2Key}`)

    const thumbKey = r2Key.replace(/\.mp4$/, '-thumb.jpg')
    await destR2.send(new PutObjectCommand({
      Bucket: r2Bucket,
      Key: thumbKey,
      Body: thumbBuf,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000, immutable',
    }))
    console.log(`[vidtranscode] uploaded thumbnail to R2: ${thumbKey}`)

    // ── 5. Write r2PreviewUrl + videoThumbnailUrl + READY to DynamoDB —
    // same helper/URL shape watermark uses for images ─────────────────────
    const r2PreviewUrl = `${PREVIEW_BASE}/${r2Key}`
    const videoThumbnailUrl = `${PREVIEW_BASE}/${thumbKey}`
    await setStatus(projectId, fileId, 'READY', { r2PreviewUrl, videoThumbnailUrl })
    console.log(`[vidtranscode] done → ${r2PreviewUrl}`)
    await bumpJobProgress(jobId)

    return { statusCode: 200, body: r2PreviewUrl }
  } catch (err) {
    console.error('[vidtranscode] ERROR:', err)
    try {
      await setStatus(projectId, fileId, 'FAILED')
    } catch (dbErr) {
      console.error('[vidtranscode] also failed to mark FAILED:', dbErr)
    }
    await bumpJobProgress(jobId)
    return { statusCode: 500, body: String(err.message ?? err) }
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
