import type { ReelAspectRatio, ReelResolution, ReelMotion } from '@/types/studio'

// Every provider implementation (KlingProvider today, Runway/Luma/Veo later)
// speaks this shape only — no provider-specific request/response mapping is
// allowed to leak into routes, the reelgen Lambda's business logic, or the
// frontend. See design doc §4.2.

export interface ImageToVideoRequest {
  // Kling's real API (confirmed from a live console sample, 2026-09-09)
  // takes the source image as a URL, not embedded bytes — the pipeline must
  // mint a presigned/public R2 URL for the source photo before calling this,
  // it cannot pass a Buffer through directly.
  imageUrl: string
  prompt: string
  motion: ReelMotion
  durationSec: number
  // NOT sent to Kling directly — its confirmed request shape has no
  // aspect_ratio field, only resolution. Output aspect ratio is achieved by
  // cropping/padding the source image to the target ratio before calling
  // Kling (a pre-processing step, not a provider-level concern) — kept here
  // so callers still know what they asked for.
  aspectRatio: ReelAspectRatio
  resolution: ReelResolution
  // REQUIRED, not just a nice-to-have — Kling's confirmed status-check
  // endpoint (GET /tasks?external_task_ids=) polls by THIS value, not by
  // Kling's own returned task id. Caller must generate a unique id per
  // clip (e.g. the reel's own child-clip id) before calling this.
  externalTaskId: string
}

export interface ImageToVideoResult {
  providerJobId: string
  estimatedCostPaise: number
}

export interface GenerationStatusResult {
  status: 'processing' | 'completed' | 'failed'
  outputUrl?: string
  actualCostPaise?: number
  errorMessage?: string
}

export interface ProviderCapabilities {
  maxDurationSec: number
  minDurationSec: number
  resolutions: ReelResolution[]
  supportsAudio: boolean
}

export interface VideoProvider {
  readonly name: string
  generateImageToVideo(request: ImageToVideoRequest): Promise<ImageToVideoResult>
  getGenerationStatus(providerJobId: string): Promise<GenerationStatusResult>
  cancelGeneration(providerJobId: string): Promise<void>
  getCapabilities(): ProviderCapabilities
}

export interface VideoProviderSelectionCriteria {
  style: string
  durationSec: number
  aspectRatio: ReelAspectRatio
  resolution: ReelResolution
}
