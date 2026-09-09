import type {
  VideoProvider, ImageToVideoRequest, ImageToVideoResult, GenerationStatusResult, ProviderCapabilities,
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
          { type: 'prompt', text: request.prompt },
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

  async getGenerationStatus(providerJobId: string): Promise<GenerationStatusResult> {
    this.assertConfigured()

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
    }
  }
}
