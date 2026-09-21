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
      // id) is what status-checks must poll by.
      const externalTaskId = `${params.reelId}:${clip.photoId}`
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
