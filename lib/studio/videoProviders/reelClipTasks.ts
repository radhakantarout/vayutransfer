import type { VideoProviderName } from '@/constants/videoProviders'
import type { ReelAspectRatio, ReelResolution, ReelMotion } from '@/types/studio'
import { VideoProviderRouter } from './router'
import type { GenerationStatusResult } from './types'

// Shared create+status-check helper for the async reelgen redesign (see
// reelgen-async-redesign-plan-2026-09 in memory). Routes call this instead of
// talking to KlingProvider/VideoProviderRouter directly, so the parallel-
// creation + deterministic-id + partial-failure handling below lives in one
// place regardless of which route (Client Gallery, Guest, Moments) calls it.

export interface ReelClipRequest {
  photoId: string
  imageUrl: string
  prompt: string
  motion: ReelMotion
}

export interface ReelClipTaskSuccess {
  photoId: string
  providerJobId: string
}

export interface ReelClipTaskFailure {
  photoId: string
  error: string
}

export interface CreateReelClipTasksResult {
  provider: VideoProviderName
  succeeded: ReelClipTaskSuccess[]
  failed: ReelClipTaskFailure[]
}

export async function createReelClipTasks(params: {
  reelId: string
  style: string
  clips: ReelClipRequest[]
  durationSec: number
  aspectRatio: ReelAspectRatio
  resolution: ReelResolution
}): Promise<CreateReelClipTasksResult> {
  const router = new VideoProviderRouter()
  const provider = router.select({
    style: params.style,
    durationSec: params.durationSec,
    aspectRatio: params.aspectRatio,
    resolution: params.resolution,
  })

  // allSettled, not all — one photo's Kling call failing must not lose the
  // providerJobIds already won by every other photo in the same reel. The
  // caller decides what a partial batch means (e.g. retry just the failed
  // photoIds, or fail the whole reel and refund) — this helper only reports.
  const settled = await Promise.allSettled(
    params.clips.map(async (clip) => {
      // Deterministic per reel+photo (not a fresh random id) so a caller-side
      // retry of the SAME clip reuses the SAME external_task_id and relies on
      // Kling's own create-time dedupe instead of risking a second, separately
      // billed task for one photo. See klingProvider.ts's confirmed real
      // create->poll cycle for why external_task_id (not Kling's own returned
      // id) is what status-checks must poll by. `-` + slice(0, 64) matches
      // the exact scheme the legacy Lambda pipeline already uses in
      // production (lambda/vayustudio-reelgen/index.js) — kept identical
      // rather than switching to a `:` separator, since real UUIDs for both
      // halves (36 + 1 + 36 = 73 chars) would otherwise silently lose the
      // photoId's tail to truncation instead of the reelId's, an unnecessary
      // behavior change with no upside.
      const externalTaskId = `${params.reelId}-${clip.photoId}`.slice(0, 64)
      const result = await provider.generateImageToVideo({
        imageUrl: clip.imageUrl,
        prompt: clip.prompt,
        motion: clip.motion,
        durationSec: params.durationSec,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        externalTaskId,
      })
      return { photoId: clip.photoId, providerJobId: result.providerJobId }
    })
  )

  const succeeded: ReelClipTaskSuccess[] = []
  const failed: ReelClipTaskFailure[] = []
  settled.forEach((outcome, i) => {
    if (outcome.status === 'fulfilled') {
      succeeded.push(outcome.value)
    } else {
      const reason = outcome.reason as unknown
      failed.push({ photoId: params.clips[i].photoId, error: reason instanceof Error ? reason.message : String(reason) })
    }
  })

  return { provider: provider.name, succeeded, failed }
}

export interface CreateTextToVideoTaskResult {
  provider: VideoProviderName
  providerJobId: string
}

// Text-to-video's own create step (Phase 6) — deliberately separate from
// createReelClipTasks above rather than folded in: text mode always has
// exactly one task per reel (no per-photo fan-out, no partial-failure
// handling to share), and its provider call has no create-time dedupe
// backstop at all (see TextToVideoRequest's own comment), unlike
// image-to-video's real one. Mixing the two into one generic helper would
// make that difference easy to miss.
export async function createTextToVideoTask(params: {
  reelId: string
  prompt: string
  aspectRatio?: ReelAspectRatio
  negativePrompt?: string
  cfgScale?: number
  cameraControl?: unknown
}): Promise<CreateTextToVideoTaskResult> {
  const router = new VideoProviderRouter()
  // select()'s criteria don't actually mean anything for text-to-video
  // (Kling's endpoint ignores duration/resolution entirely, confirmed in
  // klingProvider.ts) — passed only to satisfy VideoProviderRouter's one
  // uniform selection signature; a future second provider that only
  // implements text-to-video (not image-to-video) would need router.select
  // to branch on more than style/duration, not a concern with one provider.
  const provider = router.select({
    style: 'CINEMATIC', durationSec: 5, aspectRatio: params.aspectRatio ?? '9:16', resolution: '720p',
  })
  if (!provider.getCapabilities().supportsTextToVideo || !provider.generateTextToVideo) {
    throw new Error(`Video provider "${provider.name}" does not support text-to-video`)
  }

  // reelId alone is unique enough for CloudWatch/Kling-dashboard
  // traceability (text mode never has more than one task per reel) — NOT
  // relied on for retry-safety, since this endpoint has no create-time
  // dedupe at all. The caller's own idempotency check (has this job already
  // reached a terminal state?) before calling this is the only real guard.
  const externalTaskId = `${params.reelId}-text`.slice(0, 64)
  const result = await provider.generateTextToVideo({
    prompt: params.prompt,
    externalTaskId,
    aspectRatio: params.aspectRatio,
    negativePrompt: params.negativePrompt,
    cfgScale: params.cfgScale,
    cameraControl: params.cameraControl,
  })
  return { provider: provider.name, providerJobId: result.providerJobId }
}

export interface OmniReferenceInput {
  kind: 'image' | 'video' | 'audio' | 'subject'
  tag: string
  url: string
}

export interface CreateOmniVideoTaskResult {
  provider: VideoProviderName
  providerJobId: string
}

// Kling 3.0 Omni's own create step (reel-generator-omni-redesign plan) —
// like createTextToVideoTask, exactly one task per reel (Omni takes every
// reference in a single call, no per-photo fan-out the way image-to-video
// needs). Whether Omni has real create-time dedupe on external_task_id
// (like image-to-video) or none at all (like text-to-video) was NOT tested
// — treated conservatively as UNCONFIRMED/assume-none, same posture as
// createTextToVideoTask's own caution, until verified.
export async function createOmniVideoTask(params: {
  reelId: string
  prompt: string
  references: OmniReferenceInput[]
  durationSec: number
  aspectRatio: ReelAspectRatio
  resolution: ReelResolution
  generateAudio?: boolean
}): Promise<CreateOmniVideoTaskResult> {
  const router = new VideoProviderRouter()
  // select()'s criteria are the same uniform shape every mode passes —
  // Omni doesn't have a real "style" concept the way photo-mode's mood
  // presets do, 'CINEMATIC' here is inert (matches createTextToVideoTask's
  // own precedent).
  const provider = router.select({
    style: 'CINEMATIC', durationSec: params.durationSec, aspectRatio: params.aspectRatio, resolution: params.resolution,
  })
  if (!provider.getCapabilities().supportsOmni || !provider.generateOmniVideo) {
    throw new Error(`Video provider "${provider.name}" does not support Omni`)
  }

  const externalTaskId = `${params.reelId}-omni`.slice(0, 64)
  const result = await provider.generateOmniVideo({
    prompt: params.prompt,
    references: params.references,
    durationSec: params.durationSec,
    aspectRatio: params.aspectRatio,
    resolution: params.resolution,
    generateAudio: params.generateAudio,
    externalTaskId,
  })
  return { provider: provider.name, providerJobId: result.providerJobId }
}

// Keyed by providerJobId (== the externalTaskId createReelClipTasks minted)
// so a caller can look up any one clip's status directly without re-deriving
// photoId <-> jobId pairing itself.
export type ReelClipStatusMap = Record<string, GenerationStatusResult>

export async function checkReelClipStatuses(params: {
  providerName: VideoProviderName
  providerJobIds: string[]
}): Promise<ReelClipStatusMap> {
  if (params.providerJobIds.length === 0) return {}

  const router = new VideoProviderRouter()
  const provider = router.getByName(params.providerName)

  const settled = await Promise.allSettled(
    params.providerJobIds.map((id) => provider.getGenerationStatus(id))
  )

  const result: ReelClipStatusMap = {}
  settled.forEach((outcome, i) => {
    const providerJobId = params.providerJobIds[i]
    if (outcome.status === 'fulfilled') {
      result[providerJobId] = outcome.value
    } else {
      // A network/transport failure checking status is NOT the same as Kling
      // reporting the task itself failed — surfaced as 'processing' so a
      // transient check-cycle hiccup doesn't fail (and refund) a job that's
      // still genuinely generating. The next ~1/min check cycle just retries.
      // errorMessage is still populated (a real production stuck-reel
      // incident, 2026-09-29, had nothing anywhere — not even accessible
      // logs — explaining why a job never advanced) so the caller can
      // persist it somewhere inspectable (see reel-check's own use of this).
      const reason = outcome.reason as unknown
      const errorMessage = reason instanceof Error ? reason.message : String(reason)
      console.error(`[reelClipTasks] status check failed for ${providerJobId}:`, reason)
      result[providerJobId] = { status: 'processing', errorMessage }
    }
  })
  return result
}

export type ReclaimResult =
  | { reclaimed: true; clipUrls: string[] }
  | { reclaimed: false }

// Quick-fix (2026-09, reel-reclaim-quick-fix plan): recovers an already-
// Kling-completed reel instead of wastefully regenerating it. Works
// retroactively on reels created by EITHER the legacy Lambda-does-everything
// pipeline OR the new route-based createReelClipTasks above, because both use
// the exact same deterministic external_task_id scheme
// (`${reelId}-${photoId}`.slice(0, 64)) — the id never needs to have been
// persisted anywhere, it's recomputed on demand from data every StudioReel
// already has (reelId + photoIds), then checked against Kling directly via
// checkReelClipStatuses (a free read, not a billed call).
//
// Photo-mode only. Text-to-video has no deterministic id (Kling's own
// returned task id is required, with zero create-time dedupe) and is never
// persisted anywhere either — out of scope, see the plan doc.
export async function attemptReclaimReelClips(params: {
  reelId: string
  photoIds: string[]
  providerName: VideoProviderName
}): Promise<ReclaimResult> {
  if (params.photoIds.length === 0) return { reclaimed: false }

  const providerJobIds = params.photoIds.map((photoId) => `${params.reelId}-${photoId}`.slice(0, 64))
  const statuses = await checkReelClipStatuses({ providerName: params.providerName, providerJobIds })

  const clipUrls: string[] = []
  for (const id of providerJobIds) {
    const status = statuses[id]
    // Require every single clip to be a real, completed success with an
    // output URL — no partial reclaim. A partially-recovered reel with one
    // missing clip would need the exact same "what do we do about the
    // missing one" decision full regeneration already avoids by failing the
    // whole batch (see createReelClipTasks's own comment) — simplest and
    // safest to apply the same rule here.
    if (status?.status !== 'completed' || !status.outputUrl) return { reclaimed: false }
    clipUrls.push(status.outputUrl)
  }
  return { reclaimed: true, clipUrls }
}
