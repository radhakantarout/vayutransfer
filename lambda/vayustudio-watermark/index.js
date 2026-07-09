'use strict'

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')
const { DynamoDBClient }                               = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, UpdateCommand }        = require('@aws-sdk/lib-dynamodb')
const sharp       = require('sharp')
const { Resvg }   = require('@resvg/resvg-js')
const fs          = require('fs')
const path        = require('path')

// Load bundled font once at cold start.
// sharp 0.33+ uses resvg for SVG; resvg requires fonts via its own API —
// CSS @font-face data URIs are silently ignored, causing □ tofu boxes.
// We use @resvg/resvg-js directly with fontBuffers to bypass this.
let FONT_BUF = null
try {
  FONT_BUF = fs.readFileSync(path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf'))
  console.log('[watermark] font loaded:', FONT_BUF.length, 'bytes')
} catch (e) {
  console.warn('[watermark] font not found — text may render as boxes:', e.message)
}

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

// Tiled circular badge watermark — staggered grid covering the full image.
// Each badge: thin white circle + "Vayu" (large) + "Studios" (small) inside.
function makeWatermarkSvg(w, h) {
  const r      = Math.round(w / 7)           // circle radius ~171px on 1200px wide
  const colGap = Math.round(r * 2.35)        // horizontal spacing between centres
  const rowGap = Math.round(r * 2.15)        // vertical spacing between centres
  const fs1    = Math.round(r * 0.52)        // "Vayu" font size
  const fs2    = Math.round(r * 0.34)        // "Studios" font size

  const colCount = Math.ceil(w / colGap) + 2
  const rowCount = Math.ceil(h / rowGap) + 2

  // Text vertical centres inside circle (dominant-baseline="middle" used)
  const ty1Off = -Math.round(r * 0.20)   // "Vayu" — upper half
  const ty2Off =  Math.round(r * 0.32)   // "Studios" — lower half

  let elems = ''
  for (let row = -1; row < rowCount; row++) {
    const xOff = (row % 2 !== 0) ? Math.round(colGap / 2) : 0
    for (let col = -1; col < colCount; col++) {
      const cx = col * colGap + xOff
      const cy = row * rowGap
      const ty1 = cy + ty1Off
      const ty2 = cy + ty2Off
      elems += `
<circle cx="${cx}" cy="${cy}" r="${r}"
  fill="white" fill-opacity="0.08"
  stroke="white" stroke-width="2.5" stroke-opacity="0.60"/>
<text x="${cx}" y="${ty1}"
  font-family="sans-serif" font-size="${fs1}px" font-weight="bold"
  fill="white" fill-opacity="0.45" text-anchor="middle" dominant-baseline="middle">Vayu</text>
<text x="${cx}" y="${ty2}"
  font-family="sans-serif" font-size="${fs2}px" font-weight="bold"
  fill="white" fill-opacity="0.38" text-anchor="middle" dominant-baseline="middle">Studios</text>`
    }
  }

  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${elems}</svg>`
}

// Render SVG watermark to PNG via @resvg/resvg-js with explicit font directory.
// fontDirs makes resvg scan the directory and register all fonts found there,
// matching by the font's own internal family name — more reliable than fontBuffers.
function makeWatermarkPng(w, h) {
  const svg      = makeWatermarkSvg(w, h)
  const fontDir  = path.join(__dirname, 'fonts')
  const opts = {
    fitTo: { mode: 'original' },
    font: {
      fontDirs:        [fontDir],
      loadSystemFonts: false,
      // Map all generic CSS families to DejaVu Sans so any font-family value works
      sansSerifFamily: 'DejaVu Sans',
      serifFamily:     'DejaVu Sans',
      monospaceFamily: 'DejaVu Sans',
      cursiveFamily:   'DejaVu Sans',
      fantasyFamily:   'DejaVu Sans',
    },
  }
  const rendered = new Resvg(svg, opts).render()
  console.log(`[watermark] resvg png ${rendered.width}×${rendered.height}`)
  return rendered.asPng()
}

exports.handler = async (event) => {
  console.log('[watermark] start', JSON.stringify({
    ...event,
    r2SecretAccessKey: event.r2SecretAccessKey ? '[REDACTED]' : undefined,
  }))

  const {
    fileId, projectId,
    // Legacy field names kept for backwards compat with any in-flight/queued
    // invocations from before sourceKey/sourceBackend existed.
    s3Bucket, s3Key,
    sourceBackend = 'S3',
    sourceKey,
    sourceR2Bucket, sourceR2Endpoint, sourceR2AccessKeyId, sourceR2SecretAccessKey,
    r2Bucket, r2Key, r2Endpoint, r2AccessKeyId, r2SecretAccessKey,
    watermarkEnabled = true,
    fileType = 'IMAGE',
  } = event

  const resolvedSourceKey = sourceKey ?? s3Key

  if (!fileId || !projectId || !resolvedSourceKey) {
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
    // ── 1. Download original — S3 via the Lambda's own IAM role, or R2 via
    // explicit credentials passed in the event (R2 isn't AWS-IAM-integrated) ──
    let origBuf
    if (sourceBackend === 'R2') {
      console.log(`[watermark] download r2://${sourceR2Bucket}/${resolvedSourceKey}`)
      const sourceR2 = new S3Client({
        region: 'auto',
        endpoint: sourceR2Endpoint,
        credentials: { accessKeyId: sourceR2AccessKeyId, secretAccessKey: sourceR2SecretAccessKey },
      })
      const r2Obj = await sourceR2.send(new GetObjectCommand({ Bucket: sourceR2Bucket, Key: resolvedSourceKey }))
      origBuf = await streamToBuffer(r2Obj.Body)
    } else {
      console.log(`[watermark] download s3://${s3Bucket}/${resolvedSourceKey}`)
      const s3Obj = await s3.send(new GetObjectCommand({ Bucket: s3Bucket, Key: resolvedSourceKey }))
      origBuf = await streamToBuffer(s3Obj.Body)
    }
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
        .composite([{ input: makeWatermarkPng(outW, outH), blend: 'over' }])
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
