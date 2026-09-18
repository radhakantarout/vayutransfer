'use strict'

// Kling 3.0 Omni image generation/editing provider.
//
// *** UNCONFIRMED AGAINST A REAL KLING API KEY — READ BEFORE ENABLING ***
// Kling's own docs page (kling.ai/document-api/api/image/3-0-omni/image-generation)
// is a JS-rendered SPA that couldn't be scraped directly. The request/response
// shape below is cross-referenced from third-party API mirrors (fal.ai's
// schema mirror was the most authoritative-looking) and follows the SAME
// path convention as this codebase's already-confirmed video integration
// (lib/studio/videoProviders/klingProvider.ts: POST /image-to-video/{model},
// GET /tasks?external_task_ids=<id>) — but the exact image endpoint path,
// field names, and response shape are a well-researched BEST GUESS, not a
// verified fact. The video integration was only trusted in production after
// one real create->poll cycle against a live account (see that file's own
// header comment) — do the same here before any real credits are charged
// against this path. If Kling's real endpoint differs, this throws a clean
// error (bad response / non-2xx) rather than silently misbehaving, and the
// caller (the imagegen Lambda's handler) already refunds credits on any
// thrown error via the route's failure path.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function createTask({ apiKey, baseUrl, modelName, prompt, sourceImageUrls, resolution, aspectRatio, numImages, externalTaskId }) {
  const body = {
    prompt,
    resolution: resolution.toLowerCase(), // '1K' -> '1k', matches the mirrored schema's casing
    aspect_ratio: aspectRatio,
    num_images: numImages,
    options: { external_task_id: externalTaskId },
  }
  // 0 refs = pure text-to-image, 1-10 = editing/fusion (Kling's @Image1/
  // @Image2 syntax in `prompt` refers to this array's 1-indexed order).
  if (sourceImageUrls && sourceImageUrls.length > 0) body.image_urls = sourceImageUrls

  const res = await fetch(`${baseUrl}/image-generation/${modelName}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Kling image create failed: ${res.status} ${await res.text().catch(() => '')}`)
  const data = await res.json()
  if (data.code !== 0) throw new Error(`Kling image create returned error: ${data.code} ${data.message}`)
  return data.data.id
}

async function queryTask({ apiKey, baseUrl, externalTaskIds }) {
  const res = await fetch(`${baseUrl}/images?external_task_ids=${encodeURIComponent(externalTaskIds.join(','))}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`Kling image query failed: ${res.status} ${await res.text().catch(() => '')}`)
  const data = await res.json()
  if (data.code !== 0) throw new Error(`Kling image query returned error: ${data.code} ${data.message}`)
  return data.data // expected array, mirrors the video endpoint's shape
}

// ~3.5 min ceiling at 5s/poll — image generation should be much faster than
// video, this just gives real headroom without holding the Lambda open
// indefinitely on a stuck task.
async function generate({ prompt, sourceImageUrls, resolution, aspectRatio, numImages, apiKey, baseUrl, modelName, externalTaskId }) {
  const taskId = await createTask({ apiKey, baseUrl, modelName, prompt, sourceImageUrls, resolution, aspectRatio, numImages, externalTaskId })

  for (let attempt = 0; attempt < 40; attempt++) {
    if (attempt > 0) await sleep(5000)
    const queried = await queryTask({ apiKey, baseUrl, externalTaskIds: [taskId] })
    const task = Array.isArray(queried) ? queried[0] : queried
    if (task && task.status === 'succeeded') {
      const outputs = task.outputs || task.images || []
      const urls = outputs.map((o) => o.url).filter(Boolean)
      if (urls.length === 0) throw new Error('Kling image task succeeded but returned no output URLs')
      return urls
    }
    if (task && task.status === 'failed') {
      throw new Error(`Kling image generation failed: ${task.message || 'unknown error'}`)
    }
  }
  throw new Error('Kling image generation timed out waiting for completion')
}

module.exports = { generate }
