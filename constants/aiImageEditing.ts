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

// OpenAI gpt-image-2.5-sunburst — the PRIMARY provider as of 2026-09-20 (see
// lambda/vayustudio-imagegen/providers/openai.js's header for the real API
// facts and why Kling was replaced for images). Real billing is TOKEN-based
// (a different $/1M-token rate for text input, image input, and image
// output), which doesn't fit computeImageEditCost's per-unit shape above —
// this is a flat, real-usage-calibrated paise-per-generation lookup instead,
// same "one formula per genuinely different pricing shape" pattern as
// videoProviders.ts's computeReelCost vs computeTextToVideoCost split.
// numImages multiplies linearly (each image is an independent API call,
// unlike Kling's single multi-image-batch request via `n`).
export function computeOpenAiImageCost(
  mode: 'generate' | 'edit',
  resolution: AiImageResolution = '1K',
  numImages: number,
  rates?: {
    openaiGenerateCostPaiseMedium?: number
    openaiGenerateCostPaiseHigh?: number
    openaiEditCostPaiseMedium?: number
    openaiEditCostPaiseHigh?: number
    targetMargin?: number
    aiExtraPaisePer1000?: number
  }
): ImageEditCostEstimate {
  // '1K' -> 'medium' quality, '2K' -> 'high' quality — matches
  // providers/openai.js's own QUALITY_BY_RESOLUTION mapping exactly.
  const isHigh = resolution === '2K'
  const costPerImagePaise = mode === 'edit'
    ? (isHigh ? rates?.openaiEditCostPaiseHigh ?? 480 : rates?.openaiEditCostPaiseMedium ?? 250)
    : (isHigh ? rates?.openaiGenerateCostPaiseHigh ?? 450 : rates?.openaiGenerateCostPaiseMedium ?? 150)
  const margin = rates?.targetMargin ?? 0.55

  const rawCostPaise = Math.round(numImages * costPerImagePaise)
  const sellPricePaise = Math.round(rawCostPaise / (1 - margin))
  const aiCreditsRequired = Math.max(1, Math.ceil(sellPricePaise / aiSearchCreditPricePaise(rates?.aiExtraPaisePer1000)))
  return { rawCostPaise, sellPricePaise, aiCreditsRequired }
}
