// AI image editing (Kling) — pricing scaffolding only. No route/UI feature
// exists yet; this exists so the rate is already configurable (see
// lib/pricingConfig.ts) and the cost math is ready the moment the actual
// editing feature ships. Spends from the same unified aiSearchCredits pool
// as reels and face-indexing — no new credit type.
import { aiSearchCreditPricePaise } from './studioPricing'

export interface ImageEditCostEstimate {
  rawCostPaise: number
  sellPricePaise: number
  aiCreditsRequired: number
}

export function computeImageEditCost(
  imageCount: number,
  rates?: { klingImageEditPaisePer100kUnits?: number; klingImageEditUnitsPerImage?: number; targetMargin?: number; aiExtraPaisePer1000?: number }
): ImageEditCostEstimate {
  const paisePer100k = rates?.klingImageEditPaisePer100kUnits ?? 3395000 // $350 @ ~₹97/$1
  const unitsPerImage = rates?.klingImageEditUnitsPerImage ?? 8
  const margin = rates?.targetMargin ?? 0.55

  const rawCostPaise = Math.round(imageCount * unitsPerImage * (paisePer100k / 100000))
  const sellPricePaise = Math.round(rawCostPaise / (1 - margin))
  const aiCreditsRequired = Math.max(1, Math.ceil(sellPricePaise / aiSearchCreditPricePaise(rates?.aiExtraPaisePer1000)))
  return { rawCostPaise, sellPricePaise, aiCreditsRequired }
}
