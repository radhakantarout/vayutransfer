'use strict'

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')
const { DynamoDBClient }                               = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, UpdateCommand }        = require('@aws-sdk/lib-dynamodb')
const sharp = require('sharp')

const REGION       = process.env.AWS_REGION ?? 'ap-south-1'
const DYNAMO_TABLE = process.env.DYNAMO_TABLE ?? 'vayustudio-mediafiles'
const PREVIEW_BASE = (process.env.PREVIEW_BASE_URL ?? 'https://previews-test.test.vayutransfer.com').replace(/\/$/, '')
const MAX_DIM      = 1200  // px — longest edge of preview

const s3  = new S3Client({ region: REGION })
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }))

async function streamToBuffer(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

async function setStatus(projectId, fileId, status, extra = {}) {
  const now   = new Date().toISOString()
  const names = {}
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
    ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
    ExpressionAttributeValues: vals,
  }))
}

// Font sized so "VayuStudios" spans ~90% of image width
// Three staggered diagonal instances for full-image coverage
function makeWatermarkSvg(w, h) {
  const label = 'VayuStudios'
  // Arial Black bold char width ≈ 0.65× font-size; target 90% of image width
  const fs    = Math.max(28, Math.floor((w * 0.90) / (label.length * 0.65)))
  const angle = -28

  // Staggered vertically: upper / middle / lower
  const positions = [
    { cx: Math.round(w * 0.42), cy: Math.round(h * 0.27) },
    { cx: Math.round(w * 0.50), cy: Math.round(h * 0.52) },
    { cx: Math.round(w * 0.58), cy: Math.round(h * 0.77) },
  ]

  const rows = positions.map(({ cx, cy }) => `
    <text x="${cx + 3}" y="${cy + 3}"
      font-family="Arial Black,Arial,sans-serif" font-size="${fs}px" font-weight="900"
      fill="black" fill-opacity="0.22" text-anchor="middle" dominant-baseline="middle"
      transform="rotate(${angle},${cx + 3},${cy + 3})">${label}</text>
    <text x="${cx}" y="${cy}"
      font-family="Arial Black,Arial,sans-serif" font-size="${fs}px" font-weight="900"
      fill="white" fill-opacity="0.50" text-anchor="middle" dominant-baseline="middle"
      transform="rotate(${angle},${cx},${cy})">${label}</text>`
  ).join('')

  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${rows}</svg>`)
}

exports.handler = async (event) => {
  console.log('[watermark] start', JSON.stringify({
    ...event,
    r2SecretAccessKey: event.r2SecretAccessKey ? '[REDACTED]' : undefined,
  }))

  const {
    fileId, projectId,
    s3Bucket, s3Key,
    r2Bucket, r2Key, r2Endpoint, r2AccessKeyId, r2SecretAccessKey,
    watermarkEnabled = true,
    fileType = 'IMAGE',
  } = event

  if (!fileId || !projectId || !s3Key) {
    console.error('[watermark] missing required fields')
    return { statusCode: 400, body: 'Missing required fields' }
  }

  // Non-image files — mark READY, nothing to process
  if (fileType !== 'IMAGE') {
    await setStatus(projectId, fileId, 'READY')
    console.log(`[watermark] ${fileId} skipped (${fileType}), marked READY`)
    return { statusCode: 200, body: `Skipped: ${fileType}` }
  }

  try {
    // ── 1. Download original from S3 (Lambda IAM role) ──────────────────────
    console.log(`[watermark] download s3://${s3Bucket}/${s3Key}`)
    const s3Obj  = await s3.send(new GetObjectCommand({ Bucket: s3Bucket, Key: s3Key }))
    const origBuf = await streamToBuffer(s3Obj.Body)
    console.log(`[watermark] downloaded ${origBuf.length} bytes`)

    // ── 2. Resize ─────────────────────────────────────────────────────────────
    // Auto-rotate based on EXIF, then shrink so longest edge ≤ MAX_DIM
    const resized = await sharp(origBuf)
      .rotate()  // honour EXIF orientation
      .resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true })
      .toBuffer({ resolveWithObject: true })

    const { data: resizedBuf, info } = resized
    const { width: outW, height: outH } = info
    console.log(`[watermark] resized to ${outW}×${outH}`)

    // ── 3. Watermark ──────────────────────────────────────────────────────────
    let finalBuf
    if (watermarkEnabled) {
      finalBuf = await sharp(resizedBuf)
        .composite([{ input: makeWatermarkSvg(outW, outH), blend: 'over' }])
        .jpeg({ quality: 82, progressive: true, mozjpeg: false })
        .toBuffer()
      console.log(`[watermark] watermark applied, JPEG ${finalBuf.length} bytes`)
    } else {
      finalBuf = await sharp(resizedBuf)
        .jpeg({ quality: 82, progressive: true, mozjpeg: false })
        .toBuffer()
      console.log(`[watermark] no watermark, JPEG ${finalBuf.length} bytes`)
    }

    // ── 4. Upload to R2 ───────────────────────────────────────────────────────
    const r2 = new S3Client({
      region: 'auto',
      endpoint: r2Endpoint,
      credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
    })

    await r2.send(new PutObjectCommand({
      Bucket:       r2Bucket,
      Key:          r2Key,
      Body:         finalBuf,
      ContentType:  'image/jpeg',
      CacheControl: 'public, max-age=31536000, immutable',
    }))
    console.log(`[watermark] uploaded to R2: ${r2Key}`)

    // ── 5. Write r2PreviewUrl + READY to DynamoDB ─────────────────────────────
    const r2PreviewUrl = `${PREVIEW_BASE}/${r2Key}`
    await setStatus(projectId, fileId, 'READY', { r2PreviewUrl })
    console.log(`[watermark] done → ${r2PreviewUrl}`)

    return { statusCode: 200, body: r2PreviewUrl }

  } catch (err) {
    console.error('[watermark] ERROR:', err)
    try {
      await setStatus(projectId, fileId, 'FAILED')
    } catch (dbErr) {
      console.error('[watermark] also failed to mark FAILED:', dbErr)
    }
    return { statusCode: 500, body: String(err.message ?? err) }
  }
}
