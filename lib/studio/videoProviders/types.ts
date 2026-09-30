import type { ReelAspectRatio, ReelResolution, ReelMotion } from '@/types/studio'
import type { VideoProviderName } from '@/constants/videoProviders'

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

// Kling's real /text-to-video/{model} endpoint (Phase 6, 2026-09-29) — a
// genuinely separate endpoint from image-to-video, not a variant of it (see
// klingProvider.ts's header for the full confirmed contract). No source
// photo/motion concept applies here.
export interface TextToVideoRequest {
  prompt: string
  // Unlike ImageToVideoRequest#externalTaskId, this is NOT a retry-safety
  // mechanism — Kling's text-to-video endpoint gives NO create-time
  // duplicate protection on external_task_id (confirmed: submitting the
  // identical value twice creates two separate, separately-billed real
  // tasks). Sent for CloudWatch/Kling-dashboard traceability only; callers
  // must not rely on it to make a retry safe.
  externalTaskId: string
  aspectRatio?: ReelAspectRatio
  negativePrompt?: string
  cfgScale?: number
  cameraControl?: unknown
}

export interface TextToVideoResult {
  providerJobId: string
}

// Kling 3.0 Omni (reel-generator-omni-redesign plan, 2026-09-29) — a THIRD,
// genuinely different Kling endpoint (POST /omni-video/kling-3.0-omni),
// confirmed via a real API call. Unlike image-to-video/text-to-video, one
// call takes 1+ reference items (images today; video/audio/subject kinds
// are typed here for the full v1 scope but their exact request shape is
// NOT yet confirmed — see OmniReference's own comment) referenced inline in
// the prompt via literal `<<<tag>>>` markers, confirmed required by a real
// 400 response. Status polling reuses the SAME `external_task_ids=` scheme
// as image-to-video (confirmed) — simpler than text-to-video, which needed
// its own `task_ids=`/prefix-discrimination scheme.
export interface OmniReference {
  kind: 'image' | 'video' | 'audio' | 'subject'
  // Must exactly match a `<<<tag>>>` marker literally present in the
  // request's prompt string — Kling rejects (or silently ignores; not
  // independently tested) a reference with no corresponding prompt mention.
  tag: string
  url: string
  // 'subject' kind only — 1-3 image URLs forming one named consistent
  // character (per third-party doc cross-reference; NOT independently
  // confirmed against a real call — do not build UI/routes that construct
  // a subject reference until this is confirmed).
  extraUrls?: string[]
}

export interface OmniVideoRequest {
  // Must literally contain a `<<<tag>>>` marker per entry in `references`.
  prompt: string
  references: OmniReference[]
  durationSec: number
  aspectRatio: ReelAspectRatio
  resolution: ReelResolution
  // Maps to Kling's real `settings.audio` field, confirmed to be a STRING
  // enum ('native'|'off'|'original'), NOT a boolean — a first real test
  // with a boolean was rejected. `true` here means 'native' (generate new
  // audio); `original` (preserve a reference video's own audio) is not yet
  // exposed at this interface layer since it only makes sense paired with
  // a 'video' kind reference, whose own request shape isn't confirmed yet.
  generateAudio?: boolean
  externalTaskId: string
}

export interface OmniVideoResult {
  // Unprefixed, same as ImageToVideoResult#providerJobId — Omni's confirmed
  // `external_task_ids=` poll scheme means getGenerationStatus needs no
  // special-casing for Omni job ids at all, unlike text-to-video's.
  providerJobId: string
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
  supportsTextToVideo: boolean
  supportsOmni: boolean
  maxOmniReferenceImages: number
  maxOmniReferenceImagesWithVideo: number
}

export interface VideoProvider {
  readonly name: VideoProviderName
  generateImageToVideo(request: ImageToVideoRequest): Promise<ImageToVideoResult>
  // Optional — not every provider supports text-to-video (Kling does; a
  // future Runway/Luma/Veo integration may or may not). Callers must check
  // getCapabilities().supportsTextToVideo before calling this.
  generateTextToVideo?(request: TextToVideoRequest): Promise<TextToVideoResult>
  // Optional — same pattern as generateTextToVideo?. Callers must check
  // getCapabilities().supportsOmni before calling this.
  generateOmniVideo?(request: OmniVideoRequest): Promise<OmniVideoResult>
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
