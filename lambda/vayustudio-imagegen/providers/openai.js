'use strict'

// OpenAI gpt-image-2.5-sunburst — the primary image generation/editing
// provider as of 2026-09-20, replacing Kling for this feature after real
// visual-comparison testing found Kling's edit path (even with its own
// corrected request schema) didn't preserve the input photo's identity
// closely enough. Kling stays the video provider (lambda/vayustudio-reelgen)
// — this swap is scoped to images only. Real, confirmed-via-live-call facts
// (2026-09-20, model released after this codebase's last training-data
// cutoff, docs fetched directly from developers.openai.com):
//
// - Generation: POST {baseUrl}/images/generations — plain JSON body
//   {model, prompt, n, size, quality}. Response: base64 in each
//   data[].b64_json — NOT a URL to fetch, unlike Kling's response shape.
// - Edit: POST {baseUrl}/images/edits — MULTIPART FORM-DATA, not JSON.
//   {model, image: <uploaded file>, prompt, n, size, quality}. `image` MUST
//   be a real file upload — a URL string is not accepted here at all (the
//   opposite of Kling, which only ever took URLs). No `mask` is sent — an
//   omitted mask means the whole image is eligible for the model to
//   consider, guided by the prompt alone, which is what "keep the person,
//   change the background" style edits need (a mask is for precise
//   region-only inpainting, not needed for this feature's use case).
// - Confirmed via a real photo: output genuinely preserved the person's
//   face/pose/outfit/background details while applying the requested
//   change — meaningfully more faithful than Kling's best real result for
//   the identical photo and prompt.
// - No task/poll cycle at all — a single synchronous HTTP call returns the
//   final image(s) directly, unlike Kling's async create+poll pattern.
// - Real cost data points (from the response's own `usage` field, real
//   calls, 2026-09-20) — ALL FOUR (generate/edit x medium/high) directly
//   measured, none extrapolated: generation @ 'medium'/1024x1024 = 439
//   output image tokens (~$0.0133, ~₹1.29); generation @ 'high'/1536x1024 =
//   1372 output tokens (~$0.0413, ~₹4.00); edit @ 'medium'/1024x1536 with 1
//   reference photo = 1482 image-input + 343 output tokens (~$0.0223,
//   ~₹2.16); edit @ 'high'/864x1536 with 1 reference photo = 1482
//   image-input + 1078 output tokens (~$0.0444, ~₹4.30) — unlike Kling,
//   OpenAI's edit mode has no quality restriction, high-quality editing
//   confirmed working via this real call. See constants/aiImageEditing.ts's
//   cost comment for the exact paise values these round up to.
// - Multi-image editing is NOT implemented here either (same posture as
//   Kling's fix) — this endpoint's `image` field only documented/tested for
//   a single file; combining multiple references would need separate real
//   verification before being trusted.

const OPENAI_BASE_URL = 'https://api.openai.com/v1'
const MODEL = 'gpt-image-2.5-sunburst'

async function callGenerate({ apiKey, prompt, size, quality, numImages }) {
  const res = await fetch(`${OPENAI_BASE_URL}/images/generations`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    // output_format: 'jpeg' confirmed via a real call (2026-09-20, magic
    // bytes checked: ff d8 ff — genuine JPEG) — the R2 upload step in
    // index.js hardcodes ContentType: 'image/jpeg' for every provider, so
    // this must be explicit rather than relying on OpenAI's own PNG default.
    body: JSON.stringify({ model: MODEL, prompt, n: numImages, size, quality, output_format: 'jpeg' }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data) {
    throw new Error(`OpenAI image generation failed: ${res.status} ${data ? JSON.stringify(data) : await res.text().catch(() => '')}`)
  }
  return data
}

// Detects the real format from magic bytes rather than assuming PNG —
// source photos in this codebase are commonly JPEG (uploads accept
// .jpg/.jpeg/.png per MediaFile), and mislabeling the multipart part's
// Content-Type could cause OpenAI to reject or mis-decode the upload.
function detectImageMimeType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' }
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return { mime: 'image/png', ext: 'png' }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' }
  return { mime: 'image/png', ext: 'png' } // sane fallback, matches the format this endpoint defaults to itself
}

async function callEdit({ apiKey, prompt, size, quality, numImages, imageBuffer }) {
  const { mime, ext } = detectImageMimeType(imageBuffer)
  const form = new FormData()
  form.append('model', MODEL)
  form.append('image', new Blob([imageBuffer], { type: mime }), `source.${ext}`)
  form.append('prompt', prompt)
  form.append('n', String(numImages))
  form.append('size', size)
  form.append('quality', quality)
  form.append('output_format', 'jpeg')

  const res = await fetch(`${OPENAI_BASE_URL}/images/edits`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: form,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data) {
    throw new Error(`OpenAI image edit failed: ${res.status} ${data ? JSON.stringify(data) : await res.text().catch(() => '')}`)
  }
  return data
}

// Maps this feature's existing aspect-ratio vocabulary (built for Kling,
// which took a named aspect_ratio string) onto OpenAI's real accepted size
// format: WIDTHxHEIGHT, multiples of 16, aspect ratio bounded to 1:3-3:1,
// max 3840px/edge (confirmed via docs 2026-09-20) — every value below is a
// real multiple of 16. '1K'/'2K' (this feature's existing "Quality" toggle)
// map onto OpenAI's own quality tiers plus a roughly-1024-vs-1536 pixel
// scale, matching the two real-tested tiers in the header above — reusing
// the existing UI's two-tier concept, not a literal resolution claim.
const SIZE_BY_ASPECT_RATIO = {
  '1K': {
    auto: '1024x1024', '1:1': '1024x1024', '16:9': '1024x576', '9:16': '576x1024',
    '4:3': '1024x768', '3:4': '768x1024', '3:2': '1024x688', '2:3': '688x1024', '21:9': '1024x448',
  },
  '2K': {
    auto: '1536x1024', '1:1': '1536x1536', '16:9': '1536x864', '9:16': '864x1536',
    '4:3': '1536x1152', '3:4': '1152x1536', '3:2': '1536x1024', '2:3': '1024x1536', '21:9': '1536x656',
  },
}
const QUALITY_BY_RESOLUTION = { '1K': 'medium', '2K': 'high' }

function resolveSizeAndQuality(resolution, aspectRatio) {
  const tier = resolution === '2K' ? '2K' : '1K'
  const size = SIZE_BY_ASPECT_RATIO[tier][aspectRatio] || SIZE_BY_ASPECT_RATIO[tier].auto
  return { size, quality: QUALITY_BY_RESOLUTION[tier] }
}

// Returns Buffers directly (not URLs, unlike kling.js) — OpenAI's response
// already contains the final image bytes inline as base64, there is no
// result URL to separately fetch.
async function generate({ prompt, sourceImageUrls, resolution, aspectRatio, numImages, apiKey }) {
  const hasReference = sourceImageUrls && sourceImageUrls.length > 0
  if (sourceImageUrls && sourceImageUrls.length > 1) {
    throw new Error('Multi-image editing is not yet supported — select a single photo to edit.')
  }
  const { size, quality } = resolveSizeAndQuality(resolution, aspectRatio)

  let data
  if (hasReference) {
    const imgRes = await fetch(sourceImageUrls[0])
    if (!imgRes.ok) throw new Error(`Failed to download source photo for editing: ${imgRes.status}`)
    const imageBuffer = Buffer.from(await imgRes.arrayBuffer())
    data = await callEdit({ apiKey, prompt, size, quality, numImages, imageBuffer })
  } else {
    data = await callGenerate({ apiKey, prompt, size, quality, numImages })
  }

  const images = (data.data || []).filter((d) => d.b64_json)
  if (images.length === 0) throw new Error('OpenAI image request succeeded but returned no image data')
  console.log(`[openai] usage: ${JSON.stringify(data.usage || {})}`)
  return images.map((d) => Buffer.from(d.b64_json, 'base64'))
}

module.exports = { generate }
