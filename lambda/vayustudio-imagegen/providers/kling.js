'use strict'

// Kling image generation/editing provider.
//
// CORRECTED 2026-09-20 against real Kling API calls after a genuine product
// bug was reported: single-photo "Edit with AI" was producing a completely
// unrelated new image with zero resemblance to the input, even with a
// correct @Image1 prompt reference. Root cause: the entire original
// implementation (2026-09-18) was built against a WRONG schema for this
// endpoint. Real facts, this time confirmed with actual visual comparison of
// input vs. output (not just "the API accepted the request without erroring"
// — that earlier, weaker bar is exactly what let the wrong schema ship):
//
// - Create: POST {baseUrl}/v1/images/generations — endpoint path itself was
//   correct all along, the BODY SHAPE was not.
// - Single-reference editing uses `image` (SINGULAR string, one URL or
//   base64), NOT `image_urls` (plural array) — `image_urls` is not part of
//   this endpoint's real schema at all. Sending it is silently accepted
//   (Kling ignores unrecognized fields rather than rejecting the request),
//   which is exactly why the old implementation never errored yet never
//   actually used the reference photo — nothing was wrong with the HTTP call
//   itself, the image data just never reached Kling in a field it reads.
// - `model_name: 'kling-v2-1'` is REQUIRED for real single-image editing to
//   work — confirmed via a real before/after test against the exact same
//   photo: omitting model_name (the old approach) produced an unrelated
//   generic image regardless of prompt wording or @Image1 presence;
//   `model_name: 'kling-v2-1'` + `image` produced a real edit that
//   genuinely preserved the person, pose, outfit, and background details
//   (down to legible background text) while applying the requested change.
//   'kling-3.0-omni'/'kling-v3-omni' (tried in the original, wrong
//   implementation) are NOT valid values for this endpoint — that finding
//   was accurate, it just led to the wrong conclusion (that omitting
//   model_name was correct, rather than that a DIFFERENT explicit value was
//   needed).
// - There is NO real `@Image1`/`@Image2`/multi-reference syntax on this
//   endpoint — that was never a real Kling convention, it was an incorrect
//   assumption built into the original implementation. This endpoint only
//   accepts ONE reference image via `image`. Real multi-image fusion (2+
//   reference photos combined into one scene) requires an entirely
//   different endpoint (`/v1/images/omni-image`, model_name
//   'kling-image-o1', an `image_list` array of `{image: url}` objects, and
//   `<<<object_N>>>`-style prompt placeholders) — NOT YET IMPLEMENTED OR
//   VERIFIED. Multi-image edit is intentionally capped to 1 reference photo
//   at the route layer (MAX_SOURCE_IMAGES) until that endpoint is tested for
//   real, rather than continuing to ship a multi-image path that was never
//   actually confirmed to work.
// - `resolution` behaves differently under `model_name: 'kling-v2-1'` than
//   the original (default-model, no-model_name) testing found: '1k' works,
//   '2k' is REJECTED outright ("resolution value '2k' is not supported") —
//   the opposite of the original finding that both worked, because that
//   finding was against a different (default) model. Edit mode is
//   restricted to 1K only (enforced at the route layer); pure generation
//   (no reference image, no model_name sent) is UNCHANGED and still
//   supports both 1K/2K, since that path was never reported broken and this
//   fix is deliberately scoped to what's actually confirmed.
// - `aspect_ratio` works fine alongside `model_name`/`image` — confirmed via
//   a real call, output correctly cropped to the requested ratio with
//   identity still preserved.
// - `negative_prompt` is a real accepted field on this endpoint, sent as an
//   empty string when unused (matches Kling's own example request).
// - `n` (not `num_images`) is still the batch-count field, unchanged.
// - `external_task_id` still gives real create-time idempotency, unchanged.
// - Real cost: a single-reference edit at 1k billed exactly 8 units — no
//   different from plain 1-image generation (see
//   constants/aiImageEditing.ts's unitsPerReference comment, now 0 not a
//   provisional surcharge).
// - Poll: GET {baseUrl}/v1/images/generations/{taskId} — unchanged, still
//   confirmed correct (this part of the original implementation was right).
// - Response envelope unchanged: {code, message, request_id, data}. code
//   === 0 is success. task_status: 'submitted' | 'processing' | 'succeed' |
//   'failed'. On success, data.task_result.images is an array of
//   {index, url}.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function createTask({ apiKey, baseUrl, prompt, sourceImageUrls, resolution, aspectRatio, numImages, externalTaskId }) {
  const hasReference = sourceImageUrls && sourceImageUrls.length > 0
  // Multi-reference (2+) is not a real capability of THIS endpoint at all —
  // enforced again here (belt-and-braces on top of the route's own
  // MAX_SOURCE_IMAGES=1 cap) so a future regression in that cap can't
  // silently send a broken multi-image request.
  if (sourceImageUrls && sourceImageUrls.length > 1) {
    throw new Error('Multi-image editing is not yet supported — select a single photo to edit.')
  }

  const body = hasReference
    ? {
        // The real, confirmed-working single-image edit shape — no
        // aspect_ratio-driven 4K, no @ImageN prompt syntax, no image_urls.
        model_name: 'kling-v2-1',
        prompt,
        negative_prompt: '',
        image: sourceImageUrls[0],
        aspect_ratio: aspectRatio,
        n: numImages,
        external_task_id: externalTaskId,
        // Deliberately NO resolution field — 'kling-v2-1' rejects '2k'
        // outright, and the route layer already forces resolution to '1K'
        // for edit mode, so there is nothing valid left to send beyond
        // Kling's own default for this model.
      }
    : {
        // Pure text-to-image — UNCHANGED from the original, still-correct
        // default-model behavior (no model_name, both 1k/2k supported).
        prompt,
        resolution: resolution.toLowerCase(),
        aspect_ratio: aspectRatio,
        n: numImages,
        external_task_id: externalTaskId,
      }

  const res = await fetch(`${baseUrl}/v1/images/generations`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data || data.code !== 0) {
    throw new Error(`Kling image create failed: ${res.status} ${data ? JSON.stringify(data) : await res.text().catch(() => '')}`)
  }
  return data.data.task_id
}

// Path-param form only — confirmed above that the query-string filter forms
// silently ignore the filter and return the whole account history, which
// would make this function report success/failure for the WRONG task.
async function queryTask({ apiKey, baseUrl, taskId }) {
  const res = await fetch(`${baseUrl}/v1/images/generations/${taskId}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data || data.code !== 0) {
    throw new Error(`Kling image query failed: ${res.status} ${data ? JSON.stringify(data) : await res.text().catch(() => '')}`)
  }
  return data.data
}

// ~3.5 min ceiling at 5s/poll — image generation should be much faster than
// video, this just gives real headroom without holding the Lambda open
// indefinitely on a stuck task.
async function generate({ prompt, sourceImageUrls, resolution, aspectRatio, numImages, apiKey, baseUrl, externalTaskId }) {
  const taskId = await createTask({ apiKey, baseUrl, prompt, sourceImageUrls, resolution, aspectRatio, numImages, externalTaskId })

  for (let attempt = 0; attempt < 40; attempt++) {
    if (attempt > 0) await sleep(5000)
    const task = await queryTask({ apiKey, baseUrl, taskId })
    if (task.task_status === 'succeed') {
      const outputs = (task.task_result && task.task_result.images) || []
      const urls = outputs.map((o) => o.url).filter(Boolean)
      if (urls.length === 0) throw new Error('Kling image task succeeded but returned no output URLs')
      return urls
    }
    if (task.task_status === 'failed') {
      throw new Error(`Kling image generation failed: ${task.task_status_msg || 'unknown error'}`)
    }
  }
  throw new Error('Kling image generation timed out waiting for completion')
}

module.exports = { generate }
