import type {
  VideoProvider, ImageToVideoRequest, ImageToVideoResult, TextToVideoRequest, TextToVideoResult,
  GenerationStatusResult, ProviderCapabilities,
} from './types'

// Base URL + auth confirmed against Kling's own console (2026-09-09): simple
// "API Key (for all models)" bearer-token auth, `Authorization: Bearer <KEY>`
// — NOT the separate Access/Secret-Key JWT scheme, which the console says is
// legacy-models-only. api-singapore.klingai.com is the correct endpoint for
// servers outside China (per the console's own notice).
//
// Every piece of this file is now confirmed by a real, full create->poll
// cycle against this exact account (2026-09-09, task id 926484082518392851,
// external_task_id "vayustudio-test-001", Kling's own documented sample
// image) — not guesses:
//   - POST /image-to-video/kling-3.0-turbo creates a task, returns
//     {code,message,request_id,data:{id,status:"submitted",external_id,...}}
//   - GET /tasks?external_task_ids=<id> polls by OUR OWN external id (not
//     Kling's own task id) — returns {code,message,request_id,data:[{...}]},
//     an ARRAY. Confirmed real status transition submitted -> succeeded.
//   - On success, data[0].outputs[] contains {type:'video', url, duration}.
//     watermark_info:{enabled:false} on the create call was confirmed to
//     actually work — the succeeded response had no watermark_url field at
//     all, only the clean `url`.
//   - Kling's returned video URL is a signed, hotlink-protected CDN link
//     that Kling says is cleared after 30 days — the pipeline must
//     download and persist it to our own R2 promptly, never treat it as a
//     stable long-term URL.
//   - billing[] on the succeeded response looked like
//     {charge_type:'unit', amount:'5', package_type:'video'} for our real
//     5-second test call — 'unit' (resource-package) rather than 'cash'
//     for this account; treated as informational only below, since
//     constants/videoProviders.ts#computeReelCost is our own real billing
//     source of truth regardless of what Kling reports.
const KLING_API_BASE_URL = process.env.KLING_API_BASE_URL || 'https://api-singapore.klingai.com'
const KLING_API_KEY = process.env.KLING_API_KEY
const KLING_MODEL_NAME = process.env.KLING_MODEL_NAME || 'kling-3.0-turbo'

// Base preservation instructions (identity/clothing/no-hallucination) stay
// constant across every style — only the mood/motion fragment (composed by
// the caller, e.g. REEL_STYLE_META's promptFragment) changes. This lived in
// the legacy Lambda's own createKlingTask before the async redesign moved
// task creation here (Phases 2-4) — that move silently dropped this suffix
// entirely (found and fixed 2026-09-29, alongside Phase 6): every
// image-to-video reel created via the new route-based path was missing it.
// Centralized here, not per-caller, so no future route can forget it again.
const IMAGE_TO_VIDEO_BASE_SUFFIX = 'photorealistic motion, preserve facial identity, clothing and jewellery exactly, no additional people, no text, no logos, no artificial objects.'

// Text-to-video mode has no source photo to preserve identity/clothing FOR
// — appending IMAGE_TO_VIDEO_BASE_SUFFIX's "preserve facial identity"
// instruction to a from-scratch generation would be meaningless. Lighter,
// generic quality guardrail instead — same suffix the legacy Lambda applied.
const TEXT_TO_VIDEO_BASE_SUFFIX = 'high quality, smooth natural motion, no text, no watermark, no logos.'

// Discriminates a text-to-video providerJobId from an image-to-video one
// within the single getGenerationStatus(string) signature — kept this way
// (rather than widening the VideoProvider interface) so callers that already
// treat providerJobId as an opaque string (checkReelClipStatuses, the
// reel-check cron) need no changes. Real Kling ids and our own
// external_task_ids never contain a colon, so this prefix can't collide.
// Needed because the two task types must be polled completely differently:
// image-to-video polls by OUR OWN external_task_id via `external_task_ids=`;
// text-to-video must poll by KLING'S OWN returned task id via `task_ids=`
// (confirmed: the former returns an empty array for text-to-video tasks).
const TEXT_TO_VIDEO_JOB_PREFIX = 'text:'

interface KlingCreateResponse {
  code: number
  message: string
  data: { id: string; status: string; external_id?: string }
}

interface KlingTaskOutput {
  type: string
  url?: string
  watermark_url?: string
  duration?: string
}

interface KlingQueryResponse {
  code: number
  message: string
  data: Array<{
    id: string
    status: string
    message?: string
    external_id?: string
    outputs?: KlingTaskOutput[]
  }>
}

export class KlingProvider implements VideoProvider {
  readonly name = 'kling'

  private assertConfigured(): void {
    if (!KLING_API_KEY) {
      throw new Error('KLING_API_KEY is not set — Kling account not yet fully provisioned (see design doc Phase 0)')
    }
  }

  async generateImageToVideo(request: ImageToVideoRequest): Promise<ImageToVideoResult> {
    this.assertConfigured()

    const res = await fetch(`${KLING_API_BASE_URL}/image-to-video/${KLING_MODEL_NAME}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KLING_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          { type: 'prompt', text: `${request.prompt}, ${IMAGE_TO_VIDEO_BASE_SUFFIX}` },
          { type: 'first_frame', url: request.imageUrl },
        ],
        settings: {
          resolution: request.resolution,
          duration: request.durationSec,
        },
        options: {
          external_task_id: request.externalTaskId,
          // Confirmed working — a real test call with this set returned no
          // watermark_url on the succeeded output, only a clean `url`.
          watermark_info: { enabled: false },
        },
      }),
    })

    if (!res.ok) {
      throw new Error(`Kling generateImageToVideo failed: ${res.status} ${await res.text().catch(() => '')}`)
    }
    const data = await res.json() as KlingCreateResponse
    if (data.code !== 0) {
      throw new Error(`Kling generateImageToVideo returned an error code: ${data.code} ${data.message}`)
    }
    return {
      // externalTaskId, not data.data.id — the status-check endpoint polls
      // by our own id, so that's the value the rest of the pipeline needs.
      providerJobId: request.externalTaskId,
      estimatedCostPaise: 0, // not returned on task creation; see file header
    }
  }

  // Kling text-to-video — CONFIRMED via a real API call against this
  // account (2026-09-18), and genuinely different from image-to-video above
  // in ways that are NOT obvious from Kling's own generic docs (which
  // describe a single unified video endpoint where omitting image_url
  // implies text-to-video — that is NOT how this account's API actually
  // behaves):
  //   - Real endpoint: POST {baseUrl}/text-to-video/{model} (confirmed
  //     un-versioned, matching image-to-video's own convention) — a
  //     genuinely SEPARATE endpoint, not image-to-video with first_frame
  //     omitted (that combination returns a hard 400: "content item of type
  //     'first_frame' is required").
  //   - FLAT request body (prompt, external_task_id, ...) — NOT the nested
  //     contents[]/settings{} shape image-to-video uses.
  //   - `duration`/`resolution` are silently accepted but NOT respected —
  //     every real test produced an identical ~5.04s clip and identical
  //     4-unit charge regardless of value sent. Never expose a
  //     duration/resolution choice in the UI for this mode.
  //   - `aspect_ratio`/`negative_prompt`/`cfg_scale`/`camera_control` are all
  //     accepted without error (real object-form camera_control tested too).
  //   - CRITICAL: `external_task_id` gives NO create-time duplicate
  //     protection here (see TextToVideoRequest's own comment) — the
  //     idempotency guard the CALLER must apply (checking its own job status
  //     before ever reaching this method) is the ONLY protection against a
  //     retry double-charging a text-to-video generation.
  async generateTextToVideo(request: TextToVideoRequest): Promise<TextToVideoResult> {
    this.assertConfigured()

    const body: Record<string, unknown> = {
      prompt: `${request.prompt}, ${TEXT_TO_VIDEO_BASE_SUFFIX}`,
      external_task_id: request.externalTaskId,
    }
    if (request.aspectRatio) body.aspect_ratio = request.aspectRatio
    if (request.negativePrompt) body.negative_prompt = request.negativePrompt
    if (typeof request.cfgScale === 'number') body.cfg_scale = request.cfgScale
    if (request.cameraControl) body.camera_control = request.cameraControl

    const res = await fetch(`${KLING_API_BASE_URL}/text-to-video/${KLING_MODEL_NAME}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KLING_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      throw new Error(`Kling generateTextToVideo failed: ${res.status} ${await res.text().catch(() => '')}`)
    }
    const data = await res.json() as KlingCreateResponse
    if (data.code !== 0) {
      throw new Error(`Kling generateTextToVideo returned an error code: ${data.code} ${data.message}`)
    }
    // Kling's OWN task id (data.data.id), NOT external_task_id — text-to-video
    // status checks require it (see getGenerationStatus/getTextToVideoStatus
    // below). Prefixed so a later status/cancel call knows which query style
    // to use for this specific job.
    return { providerJobId: `${TEXT_TO_VIDEO_JOB_PREFIX}${data.data.id}` }
  }

  async getGenerationStatus(providerJobId: string): Promise<GenerationStatusResult> {
    this.assertConfigured()

    if (providerJobId.startsWith(TEXT_TO_VIDEO_JOB_PREFIX)) {
      return this.getTextToVideoStatus(providerJobId.slice(TEXT_TO_VIDEO_JOB_PREFIX.length))
    }

    const res = await fetch(`${KLING_API_BASE_URL}/tasks?external_task_ids=${encodeURIComponent(providerJobId)}`, {
      headers: {
        'Authorization': `Bearer ${KLING_API_KEY}`,
        'Content-Type': 'application/json',
      },
    })
    if (!res.ok) {
      return { status: 'failed', errorMessage: `Kling status check failed: ${res.status}` }
    }
    const data = await res.json() as KlingQueryResponse
    if (data.code !== 0) {
      return { status: 'failed', errorMessage: `Kling status check returned error code ${data.code}: ${data.message}` }
    }
    const task = data.data[0]
    if (!task) return { status: 'failed', errorMessage: `No Kling task found for external_task_id ${providerJobId}` }

    if (task.status === 'succeeded') {
      const video = task.outputs?.find((o) => o.type === 'video')
      if (!video?.url) return { status: 'failed', errorMessage: 'Kling reported succeeded but returned no video output' }
      return { status: 'completed', outputUrl: video.url }
    }
    if (task.status === 'failed') {
      return { status: 'failed', errorMessage: task.message || 'Kling reported generation failure' }
    }
    return { status: 'processing' } // submitted | processing
  }

  // Polls by Kling's own real task id (`task_ids=`), NOT `external_task_ids=`
  // like image-to-video above — confirmed the latter returns an empty result
  // set for text-to-video tasks even though the exact same query style works
  // for image-to-video. This is the single most easily-miswired part of this
  // integration if copy-pasted without noticing the param name changed.
  private async getTextToVideoStatus(klingTaskId: string): Promise<GenerationStatusResult> {
    const res = await fetch(`${KLING_API_BASE_URL}/tasks?task_ids=${encodeURIComponent(klingTaskId)}`, {
      headers: {
        'Authorization': `Bearer ${KLING_API_KEY}`,
        'Content-Type': 'application/json',
      },
    })
    if (!res.ok) {
      return { status: 'failed', errorMessage: `Kling status check failed: ${res.status}` }
    }
    const data = await res.json() as KlingQueryResponse
    if (data.code !== 0) {
      return { status: 'failed', errorMessage: `Kling status check returned error code ${data.code}: ${data.message}` }
    }
    const task = data.data.find((t) => t.id === klingTaskId)
    if (!task) return { status: 'failed', errorMessage: `No Kling task found for task_id ${klingTaskId}` }

    if (task.status === 'succeeded') {
      const video = task.outputs?.find((o) => o.type === 'video')
      if (!video?.url) return { status: 'failed', errorMessage: 'Kling reported succeeded but returned no video output' }
      return { status: 'completed', outputUrl: video.url }
    }
    if (task.status === 'failed') {
      return { status: 'failed', errorMessage: task.message || 'Kling reported generation failure' }
    }
    return { status: 'processing' }
  }

  async cancelGeneration(_providerJobId: string): Promise<void> {
    this.assertConfigured()
    // No cancel endpoint confirmed/found — best-effort no-op. If Kling
    // doesn't support cancellation, the caller's cancel action should mark
    // the job cancelled locally and let the provider job run to completion
    // unused, rather than depending on a real cancel call succeeding.
  }

  getCapabilities(): ProviderCapabilities {
    return {
      minDurationSec: 3,
      maxDurationSec: 15,
      resolutions: ['720p', '1080p'],
      supportsAudio: false, // deliberately unused — music is mixed in during FFmpeg assembly instead
      supportsTextToVideo: true,
    }
  }
}
