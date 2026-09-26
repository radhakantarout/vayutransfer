import type { VideoProviderName } from '@/constants/videoProviders'
import type { ReelAspectRatio, ReelResolution, ReelMotion } from '@/types/studio'
import { VideoProviderRouter } from './router'
import type { GenerationStatusResult } from './types'

// Shared create+status-check helper for the async reelgen redesign (see
// reelgen-async-redesign-plan-2026-09 in memory). Routes call this instead of
// talking to KlingProvider/VideoProviderRouter directly, so the parallel-
// creation + deterministic-id + partial-failure handling below lives in one
// place regardless of which route (Client Gallery, Guest, Moments) calls it.
// Not wired into any real route yet — Phase 2+ does that. Image-to-video
// only; text-to-video needs its own interface extension (Phase 6, see plan).

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
      const reason = outcome.reason as unknown
      console.error(`[reelClipTasks] status check failed for ${providerJobId}:`, reason)
      result[providerJobId] = { status: 'processing' }
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
