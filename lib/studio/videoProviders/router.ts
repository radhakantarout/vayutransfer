import { VIDEO_PROVIDER_CONFIG, type VideoProviderName } from '@/constants/videoProviders'
import { KlingProvider } from './klingProvider'
import type { VideoProvider, VideoProviderSelectionCriteria } from './types'

// Provider names are an internal implementation detail — never surface
// `provider.name` or this module's selection logic to the frontend or any
// client-facing API response (design doc §4.2/§4.3).
const PROVIDER_INSTANCES: Partial<Record<VideoProviderName, VideoProvider>> = {
  kling: new KlingProvider(),
  // runway/luma/veo: add an instance here once implemented — enabling one is
  // then just flipping `enabled: true` in constants/videoProviders.ts, no
  // other code changes required.
}

export class VideoProviderRouter {
  // Criteria params are accepted for a stable public signature even though
  // only one provider exists today — a future multi-provider router can
  // route on quality/style/duration/aspectRatio/resolution without callers
  // changing how they invoke selection.
  select(_criteria: VideoProviderSelectionCriteria): VideoProvider {
    const enabled = (Object.keys(VIDEO_PROVIDER_CONFIG) as VideoProviderName[])
      .filter((name) => VIDEO_PROVIDER_CONFIG[name].enabled)
      .sort((a, b) => VIDEO_PROVIDER_CONFIG[a].priority - VIDEO_PROVIDER_CONFIG[b].priority)

    for (const name of enabled) {
      const instance = PROVIDER_INSTANCES[name]
      if (instance) return instance
    }
    throw new Error('No video provider is enabled and implemented — check constants/videoProviders.ts')
  }
}
