// AI Image Studio (Kling image generation/editing, Moments). Spends from
// the same unified aiSearchCredits pool as reels and face-indexing — no new
// credit type. Resolution-aware the same way computeReelCost is
// resolution-aware (constants/videoProviders.ts) — units-per-image confirmed
// against a real Kling API call (2026-09-18): 8 units/image at both 1k and
// 2k. No 4K tier exists on this account (see types/studio.ts's
// AiImageResolution comment) — deliberately not a selectable resolution.
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
    klingImageEditUnitsPerReferenceImage?: number
    targetMargin?: number
    aiExtraPaisePer1000?: number
  },
  // Number of reference/source images fed to edit mode (0 for pure
  // text-to-image) — bounded to max 1 (enforced server-side, see
  // MAX_SOURCE_IMAGES in the ai-images route) since real multi-image fusion
  // needs a different, unverified Kling endpoint. Kept as a count rather
  // than a boolean since unitsPerReference is a real, if currently zero,
  // per-image rate — not just a flat edit-mode surcharge.
  referenceImageCount = 0
): ImageEditCostEstimate {
  const paisePer100k = rates?.klingImageEditPaisePer100kUnits ?? 3395000 // $350 @ ~₹97/$1
  const unitsByResolution: Record<AiImageResolution, number> = {
    '1K': rates?.klingImageEditUnitsPerImage1k ?? 8,
    '2K': rates?.klingImageEditUnitsPerImage2k ?? 8,
  }
  const unitsPerImage = unitsByResolution[resolution]
  // 0, not a provisional surcharge — TWO independent real Kling calls
  // (2026-09-18 and 2026-09-20, the second against the CORRECT edit
  // endpoint schema found after the first was confirmed wrong, see
  // lambda/vayustudio-imagegen/providers/kling.js's header) both billed
  // exactly 8 units for a single-reference-image edit, identical to plain
  // 1-image generation — no reference-image surcharge exists on this
  // account. Kept as a rates-overridable field (not deleted) in case a
  // surcharge appears once multi-reference editing is verified separately.
  const unitsPerReference = rates?.klingImageEditUnitsPerReferenceImage ?? 0
  const margin = rates?.targetMargin ?? 0.55

  const rawCostPaise = Math.round(
    (imageCount * unitsPerImage + referenceImageCount * unitsPerReference) * (paisePer100k / 100000)
  )
  const sellPricePaise = Math.round(rawCostPaise / (1 - margin))
  const aiCreditsRequired = Math.max(1, Math.ceil(sellPricePaise / aiSearchCreditPricePaise(rates?.aiExtraPaisePer1000)))
  return { rawCostPaise, sellPricePaise, aiCreditsRequired }
}
