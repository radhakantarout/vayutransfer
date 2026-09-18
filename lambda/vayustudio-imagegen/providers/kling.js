'use strict'

// Kling image generation/editing provider.
//
// CONFIRMED against a real Kling API key/account on 2026-09-18 (see the
// commit that added this comment for the full probe transcript) — this is
// NOT the same endpoint family as the already-shipped video integration
// (lib/studio/videoProviders/klingProvider.ts's un-versioned
// /image-to-video/{model} + /tasks?external_task_ids=), and an earlier draft
// of this file guessed wrong by direct analogy to that. Real, verified facts:
//
// - Create: POST {baseUrl}/v1/images/generations (note the /v1 prefix —
//   video's paths have none). No model segment in the URL.
// - `model_name` in the body is a real, recognized field, but neither
//   'kling-3.0-omni' nor 'kling-v3-omni' are accepted values ("not supported
//   for this API" / "model is not supported") — omitting it entirely uses
//   Kling's own default model and works. Left unset here until a real valid
//   non-default model_name is confirmed; the `modelName` param is threaded
//   through and ignored for now (kept so wiring a confirmed value later is a
//   one-line change, not a signature change).
// - Poll: GET {baseUrl}/v1/images/generations/{taskId} (path param, single
//   object in `data`) — confirmed working. The query-string forms
//   (?task_id=, ?external_task_ids=) also return 200 but IGNORE the filter
//   and return the account's entire task history — using either as a filter
//   would silently poll the wrong task. Do not use them for anything other
//   than an unfiltered list.
// - `resolution` only accepts lowercase '1k' or '2k' — '4k'/'4K'/'1K'/'3k'
//   all return `resolution value '...' is invalid` or 'is not supported'.
//   There is no 4K tier on this API/account. Any resolution value reaching
//   this function is lowercased defensively, but the caller (the route that
//   validates the request) must not offer '4K' as a choice at all.
// - `image_urls` (array) and the singular `image_url` both work for
//   reference-image editing/fusion mode — `image_urls` is used here since it
//   supports the multi-reference (@Image1/@Image2) case this feature needs.
// - `n` (not `num_images`) is the batch-count field. Real test: n=2 cost 16
//   units (8/image) — linear, matches the per-image assumption already in
//   constants/aiImageEditing.ts.
// - `external_task_id` (flat body field, not nested under `options` like
//   video's create call) gives real create-time idempotency — a duplicate
//   value 400s with "already exists" rather than creating a second task,
//   confirmed by a real duplicate-submit test.
// - Real cost data point: 1k and 2k both cost 8 units/image; adding ONE
//   reference image via image_urls did NOT increase the unit cost for that
//   single test. This does not match this feature's provisional
//   klingImageEditUnitsPerReferenceImage assumption (a nonzero per-reference
//   surcharge) — flagged to the user in the Phase 1 report rather than
//   silently changed, since it's a pricing/margin decision, not a code bug,
//   and a single data point isn't enough to rule out a surcharge appearing
//   only above some reference count.
// - Response envelope matches video's: {code, message, request_id, data}.
//   code === 0 is success. task_status: 'submitted' | 'processing' |
//   'succeed' | 'failed'. On success, data.task_result.images is an array of
//   {index, url}.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function createTask({ apiKey, baseUrl, prompt, sourceImageUrls, resolution, aspectRatio, numImages, externalTaskId }) {
  const body = {
    prompt,
    resolution: resolution.toLowerCase(),
    aspect_ratio: aspectRatio,
    n: numImages,
    external_task_id: externalTaskId,
  }
  // 0 refs = pure text-to-image, 1-10 = editing/fusion (Kling's @Image1/
  // @Image2 syntax in `prompt` refers to this array's 1-indexed order).
  if (sourceImageUrls && sourceImageUrls.length > 0) body.image_urls = sourceImageUrls

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
