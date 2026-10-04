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
// confirmed both via a real API call AND Kling's own official docs
// (obtained 2026-09-30). Unlike image-to-video/text-to-video, one call
// takes 1+ reference items (images today, sent as contents[] entries with
// `type: 'refer_image'; our own OmniReference.kind covers video/audio/
// subject too but their request shape maps to the docs' first_frame/
// last_frame/feature_video/base_video/element content types, none of which
// are wired in klingProvider.ts yet — see its generateOmniVideo header)
// referenced inline in the prompt via Kling's documented `@tag` mention
// syntax ("Specify an image, an Element, a video in the format of @xxx,
// such as @image_1") — NOT `<<<tag>>>`, an earlier, pre-official-docs guess
// this used before the real docs were available. Status polling reuses the
// SAME `external_task_ids=` scheme as image-to-video (confirmed) — simpler
// than text-to-video, which needed its own `task_ids=`/prefix-
// discrimination scheme.
export interface OmniReference {
  // 'first_frame'/'last_frame' added 2026-09-30 (Reel Studio) — real,
  // documented Kling content types (pins the literal start/end frame of
  // the whole generated video), distinct from 'image' (== docs' loose
  // `refer_image`, a style/subject reference). 'video'/'audio'/'subject'
  // remain unwired placeholders — see generateOmniVideo's header for why.
  kind: 'image' | 'first_frame' | 'last_frame' | 'video' | 'audio' | 'subject'
  // Must exactly match an `@tag` mention literally present in the request's
  // prompt string — Kling's docs warn tags must not be substrings of each
  // other (fine for our own sequential image_1/image_2/... scheme).
  // EXCEPT for kind 'first_frame'/'last_frame', which are never @-mentioned
  // in prose (they're structural picks, not narrative references — see the
  // Reel Studio page's own header comment) — tag is still required as a
  // unique content id, just never checked against the prompt text for
  // those two kinds specifically.
  tag: string
  url: string
  // 'subject' kind only — 1-3 image URLs forming one named consistent
  // character (per third-party doc cross-reference; NOT independently
  // confirmed against a real call — do not build UI/routes that construct
  // a subject reference until this is confirmed).
  extraUrls?: string[]
}

export interface OmniVideoRequest {
  // Must literally contain an `@tag` mention per entry in `references`
  // whose kind is 'image' (first_frame/last_frame are exempt — see
  // OmniReference.tag's own comment).
  prompt: string
  references: OmniReference[]
  durationSec: number
  // Docs: required unless a first_frame (or video-editing) content is
  // present. We always send it regardless (simpler, and sending an extra
  // optional field is far lower-risk than conditionally omitting one) —
  // not independently confirmed Kling accepts it either way when a
  // first_frame IS present, that's part of what a real test call here
  // would settle.
  aspectRatio: ReelAspectRatio
  resolution: ReelResolution
  // Maps to Kling's real `settings.audio` field, confirmed to be a STRING
  // enum ('native'|'off'|'original'), NOT a boolean — a first real test
  // with a boolean was rejected. `true` here means 'native' (generate new
  // audio); `original` (preserve a reference video's own audio) is not yet
  // exposed at this interface layer since it only makes sense paired with
  // a 'video' kind reference, whose own request shape isn't confirmed yet.
  generateAudio?: boolean
  // Maps to settings.multi_shot (documented, default true if omitted).
  // Lets a caller explicitly disable Kling's own "shot n, m, words;"
  // prompt parsing for a plain single-shot description. UNCONFIRMED
  // against a real call — Kling's own default (true) is used whenever this
  // is left undefined, which is the lower-risk choice for any caller that
  // doesn't care.
  multiShot?: boolean
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
