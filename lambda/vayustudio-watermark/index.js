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
const JOBS_TABLE   = process.env.DYNAMO_STUDIO_JOBS_TABLE ?? 'vayustudio-jobs'
const PREVIEW_BASE = (process.env.PREVIEW_BASE_URL ?? 'https://previews-test.test.vayutransfer.com').replace(/\/$/, '')
const MAX_DIM      = 1200  // px — longest edge of preview

// Reference widths a preset's 10-80 "size" slider is scaled against, chosen
// so the default size (24 for text, same slider for logo) looks reasonably
// proportioned on a real MAX_DIM-wide photo — not pixel-tied to the small
// CSS preview in WatermarkTab.tsx, which is fluid-width and was always
// described there as "approximates... not pixel-exact."
const TEXT_SIZE_REFERENCE_WIDTH = 500
const LOGO_SIZE_REFERENCE_WIDTH = 300

const s3  = new S3Client({ region: REGION })
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }))

async function streamToBuffer(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

function escapeXml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))
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

// Atomically bumps the bulk StudioJob's progress counter — this Lambda is
// invoked once per file with no shared state between invocations, so this
// is the only coordination point across a whole batch. Flips the job to
// READY once every file has reported in. Guarded with a status condition so
// a job the admin already cancelled (see the cancel route) never gets
// silently resurrected to READY by a late-finishing invocation.
async function bumpJobProgress(jobId) {
  if (!jobId) return
  try {
    const result = await ddb.send(new UpdateCommand({
      TableName: JOBS_TABLE,
      Key: { jobId },
      // "processed" is a DynamoDB reserved keyword — an unaliased
      // UpdateExpression referencing it fails with ValidationException at
      // runtime (caught below), which is exactly what silently kept every
      // watermark job stuck at 0 processed until this was found via
      // CloudWatch logs.
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
      })).catch(() => {}) // already CANCELLED/READY — leave it alone
    }
  } catch (err) {
    console.error('[watermark] bumpJobProgress failed:', err)
  }
}

// h/v alignment for each of the 9 position choices — shared by both text
// (SVG text-anchor/y-baseline) and logo (composite top/left) placement.
const POSITION_ALIGN = {
  'top-left':      { h: 'start',  v: 'start'  },
  'top-center':    { h: 'middle', v: 'start'  },
  'top-right':     { h: 'end',    v: 'start'  },
  'center-left':   { h: 'start',  v: 'middle' },
  'center':        { h: 'middle', v: 'middle' },
  'center-right':  { h: 'end',    v: 'middle' },
  'bottom-left':   { h: 'start',  v: 'end'    },
  'bottom-center': { h: 'middle', v: 'end'    },
  'bottom-right':  { h: 'end',    v: 'end'    },
}
function alignFor(position) {
  return POSITION_ALIGN[position] || POSITION_ALIGN['bottom-right']
}

// ── Text watermark — single placement or tiled ────────────────────────────

function makeSingleTextSvg(w, h, preset) {
  const fontSize = Math.max(10, Math.round(w * (preset.size / TEXT_SIZE_REFERENCE_WIDTH)))
  const margin   = Math.round(w * 0.04)
  const { h: ha, v: va } = alignFor(preset.position)
  const x = ha === 'start' ? margin : ha === 'end' ? w - margin : w / 2
  const y = va === 'start' ? margin + fontSize : va === 'end' ? h - margin : h / 2
  const anchor = ha === 'start' ? 'start' : ha === 'end' ? 'end' : 'middle'
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
<text x="${x}" y="${y}" font-family="sans-serif" font-size="${fontSize}px" font-weight="bold"
  fill="${preset.color}" fill-opacity="${preset.opacity / 100}" text-anchor="${anchor}">${escapeXml(preset.text)}</text>
</svg>`
}

// Diagonal tiled grid, same visual family as the previous fixed "Vayu
// Studios" badge pattern, generalized to the preset's own single line of
// text instead of two hardcoded lines.
function makeTiledTextSvg(w, h, preset) {
  const fontSize = Math.max(10, Math.round(w * (preset.size / TEXT_SIZE_REFERENCE_WIDTH)))
  const colGap = Math.round(fontSize * 6)
  const rowGap = Math.round(fontSize * 4)
  const colCount = Math.ceil(w / colGap) + 2
  const rowCount = Math.ceil(h / rowGap) + 2

  let elems = ''
  for (let row = -1; row < rowCount; row++) {
    const xOff = (row % 2 !== 0) ? Math.round(colGap / 2) : 0
    for (let col = -1; col < colCount; col++) {
      const cx = col * colGap + xOff
      const cy = row * rowGap
      elems += `
<text x="${cx}" y="${cy}" font-family="sans-serif" font-size="${fontSize}px" font-weight="bold"
  fill="${preset.color}" fill-opacity="${preset.opacity / 100}" text-anchor="middle" dominant-baseline="middle"
  transform="rotate(-28 ${cx} ${cy})">${escapeXml(preset.text)}</text>`
    }
  }
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${elems}</svg>`
}

// Render SVG watermark to PNG via @resvg/resvg-js with explicit font directory.
// fontDirs makes resvg scan the directory and register all fonts found there,
// matching by the font's own internal family name — more reliable than fontBuffers.
function svgToPng(svg) {
  const fontDir = path.join(__dirname, 'fonts')
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
  return rendered.asPng()
}

function makeTextWatermarkPng(w, h, preset) {
  const svg = preset.tiled ? makeTiledTextSvg(w, h, preset) : makeSingleTextSvg(w, h, preset)
  const png = svgToPng(svg)
  console.log(`[watermark] text watermark rendered (${preset.tiled ? 'tiled' : 'single'}, ${preset.position})`)
  return png
}

// ── Logo watermark — single placement or tiled ────────────────────────────

// sharp's composite() has no per-layer opacity option — the standard
// workaround is scaling the alpha channel directly on the raw pixel buffer
// before compositing.
async function applyOpacity(imgBuf, opacityPct) {
  if (opacityPct >= 100) return imgBuf
  const { data, info } = await sharp(imgBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const factor = Math.max(0, Math.min(100, opacityPct)) / 100
  for (let i = 3; i < data.length; i += info.channels) {
    data[i] = Math.round(data[i] * factor)
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer()
}

function topLeftFor(position, canvasW, canvasH, elW, elH, margin) {
  const { h: ha, v: va } = alignFor(position)
  const left = ha === 'start' ? margin : ha === 'end' ? canvasW - elW - margin : Math.round((canvasW - elW) / 2)
  const top  = va === 'start' ? margin : va === 'end' ? canvasH - elH - margin : Math.round((canvasH - elH) / 2)
  return { left, top }
}

async function makeLogoComposites(logoBuf, w, h, preset) {
  const targetW = Math.max(20, Math.round(w * (preset.size / LOGO_SIZE_REFERENCE_WIDTH)))
  const resized = await sharp(logoBuf).resize({ width: targetW }).ensureAlpha().toBuffer()
  const meta = await sharp(resized).metadata()
  const elW = meta.width
  const elH = meta.height
  const withOpacity = await applyOpacity(resized, preset.opacity)

  if (!preset.tiled) {
    const margin = Math.round(w * 0.04)
    const { left, top } = topLeftFor(preset.position, w, h, elW, elH, margin)
    return [{ input: withOpacity, left, top }]
  }

  const gapX = Math.round(elW * 2.2)
  const gapY = Math.round(elH * 2.5)
  const cols = Math.ceil(w / gapX) + 1
  const rows = Math.ceil(h / gapY) + 1
  const composites = []
  for (let row = 0; row < rows; row++) {
    const xOff = (row % 2 !== 0) ? Math.round(gapX / 2) : 0
    for (let col = -1; col < cols; col++) {
      composites.push({ input: withOpacity, left: col * gapX + xOff, top: row * gapY })
    }
  }
  console.log(`[watermark] logo watermark tiled: ${composites.length} copies`)
  return composites
}

exports.handler = async (event) => {
  console.log('[watermark] start', JSON.stringify({
    ...event,
    r2SecretAccessKey: event.r2SecretAccessKey ? '[REDACTED]' : undefined,
    sourceR2SecretAccessKey: event.sourceR2SecretAccessKey ? '[REDACTED]' : undefined,
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
    // The studio-configured design to render — resolved once per bulk
    // request by the watermark route (explicit presetId, or the studio's
    // isDefault preset), not re-looked-up here. Required whenever
    // watermarkEnabled is true; ignored when removing a watermark.
    preset,
    fileType = 'IMAGE',
    jobId,
  } = event

  const resolvedSourceKey = sourceKey ?? s3Key

  if (!fileId || !projectId || !resolvedSourceKey) {
    console.error('[watermark] missing required fields')
    return { statusCode: 400, body: 'Missing required fields' }
  }
  if (watermarkEnabled && !preset) {
    console.error('[watermark] watermarkEnabled but no preset provided')
    return { statusCode: 400, body: 'Missing watermark preset' }
  }

  // Non-image files — mark READY, nothing to process
  if (fileType !== 'IMAGE') {
    await setStatus(projectId, fileId, 'READY')
    console.log(`[watermark] ${fileId} skipped (${fileType}), marked READY`)
    await bumpJobProgress(jobId)
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

    // Destination R2 client — a logo preset also needs to READ from this
    // same bucket (see lib/studio/watermark.ts's comment on why no new
    // credentials were needed for that), so it's constructed once up front
    // regardless of whether this invocation is applying or removing.
    const r2 = new S3Client({
      region: 'auto',
      endpoint: r2Endpoint,
      credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
    })

    // ── 3. Watermark — renders whichever preset was resolved by the route ──────
    // (text: single placement or diagonal tiled grid; logo: downloaded from
    // R2, resized, opacity-adjusted, then single or tiled composite).
    let finalBuf
    if (watermarkEnabled) {
      let composites
      if (preset.type === 'logo' && preset.logoR2Key) {
        console.log(`[watermark] fetching logo r2://${r2Bucket}/${preset.logoR2Key}`)
        const logoObj = await r2.send(new GetObjectCommand({ Bucket: r2Bucket, Key: preset.logoR2Key }))
        const logoBuf = await streamToBuffer(logoObj.Body)
        composites = await makeLogoComposites(logoBuf, outW, outH, preset)
      } else {
        if (preset.type === 'logo') {
          console.warn(`[watermark] logo preset "${preset.id}" has no logoR2Key — falling back to its text field`)
        }
        composites = [{ input: makeTextWatermarkPng(outW, outH, preset), blend: 'over' }]
      }

      finalBuf = await sharp(resizedBuf)
        .composite(composites)
        .jpeg({ quality: 82, progressive: true, mozjpeg: false })
        .toBuffer()
      console.log(`[watermark] watermark applied, JPEG ${finalBuf.length} bytes`)
    } else {
      finalBuf = await sharp(resizedBuf)
        .jpeg({ quality: 82, progressive: true, mozjpeg: false })
        .toBuffer()
      console.log(`[watermark] no watermark, JPEG ${finalBuf.length} bytes`)
    }

    // ── 4. Upload to R2 ─────────────────────────────────────────────────────
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
    await bumpJobProgress(jobId)

    return { statusCode: 200, body: r2PreviewUrl }

  } catch (err) {
    console.error('[watermark] ERROR:', err)
    try {
      await setStatus(projectId, fileId, 'FAILED')
    } catch (dbErr) {
      console.error('[watermark] also failed to mark FAILED:', dbErr)
    }
    await bumpJobProgress(jobId)
    return { statusCode: 500, body: String(err.message ?? err) }
  }
}
