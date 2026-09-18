// AI Image Studio (Kling image generation/editing, Moments). Spends from
// the same unified aiSearchCredits pool as reels and face-indexing — no new
// credit type. Resolution-aware the same way computeReelCost is
// resolution-aware (constants/videoProviders.ts) — units-per-image varies
// by output resolution, PROVISIONAL until confirmed against a real Kling
// invoice (see lib/pricingConfig.ts's DEFAULT_PRICING_CONFIG comment).
import { aiSearchCreditPricePaise } from './studioPricing'
import type { AiImageResolution } from '@/types/studio'

export interface ImageEditCostEstimate {
  rawCostPaise: number
  sellPricePaise: number
  aiCreditsRequired: number
}

export function computeImageEditCost(
  imageCount: number,
  resolution: AiImageResolution = '1K',
  rates?: {
    klingImageEditPaisePer100kUnits?: number
    klingImageEditUnitsPerImage1k?: number
    klingImageEditUnitsPerImage2k?: number
    klingImageEditUnitsPerImage4k?: number
    klingImageEditUnitsPerReferenceImage?: number
    targetMargin?: number
    aiExtraPaisePer1000?: number
  },
  // Number of reference/source images fed to edit/fusion mode (0 for pure
  // text-to-image) — a bounded (max 10, enforced server-side), validated
  // cost driver that must factor into price the same way heroClipCount does
  // for reels, not be silently free.
  referenceImageCount = 0
): ImageEditCostEstimate {
  const paisePer100k = rates?.klingImageEditPaisePer100kUnits ?? 3395000 // $350 @ ~₹97/$1
  const unitsByResolution: Record<AiImageResolution, number> = {
    '1K': rates?.klingImageEditUnitsPerImage1k ?? 8,
    '2K': rates?.klingImageEditUnitsPerImage2k ?? 8,
    '4K': rates?.klingImageEditUnitsPerImage4k ?? 16,
  }
  const unitsPerImage = unitsByResolution[resolution]
  const unitsPerReference = rates?.klingImageEditUnitsPerReferenceImage ?? 2
  const margin = rates?.targetMargin ?? 0.55

  const rawCostPaise = Math.round(
    (imageCount * unitsPerImage + referenceImageCount * unitsPerReference) * (paisePer100k / 100000)
  )
  const sellPricePaise = Math.round(rawCostPaise / (1 - margin))
  const aiCreditsRequired = Math.max(1, Math.ceil(sellPricePaise / aiSearchCreditPricePaise(rates?.aiExtraPaisePer1000)))
  return { rawCostPaise, sellPricePaise, aiCreditsRequired }
}
