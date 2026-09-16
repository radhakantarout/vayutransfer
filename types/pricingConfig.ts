// Every VayuStudios/Moments pricing constant that used to be a hardcoded
// export, now owner-editable at runtime — see lib/pricingConfig.ts. Field
// names intentionally mirror the constants they replace
// (constants/studioPricing.ts, constants/videoProviders.ts) so the mapping
// between "old hardcoded name" and "new config field" is obvious at a
// glance.
export interface PricingConfig {
  freeStorageGB: number
  freeAiSearchCredits: number
  storageExtraPaisePer100GB: number
  aiExtraPaisePer1000: number
  // Real Kling billing is unit-based (confirmed against an actual invoice:
  // $0.14/unit on the current 5,000-unit deal), with per-second unit
  // consumption varying by output resolution — replaces the old flat
  // klingCostPaisePerAiSecond guess, which didn't distinguish resolution.
  klingCostPaisePerUnit: number
  klingUnitsPerSec720: number
  klingUnitsPerSec1080: number
  fixedOverheadPaisePerReel: number
  targetMargin: number
  minMarginFloor: number
  creditValuePaise: number
  momentsRetentionDays: number
  // AI image editing (Kling) — pricing scaffolding for a feature that
  // doesn't exist yet (no route/UI built). Spends from the same unified
  // aiSearchCredits pool as everything else, no new credit type, so this is
  // ready to wire up the moment the actual editing feature ships.
  klingImageEditPaisePer100kUnits: number
  klingImageEditUnitsPerImage: number
  // Friendly display-only unit for Moments ("Moments Credits") — raw
  // aiSearchCredits ÷ this divisor. Never used for accounting/enforcement,
  // only presentation.
  momentsCreditDivisor: number
  // Moments-only welcome bonus, in Moments Credits (not raw) — set
  // explicitly on Studio.aiSearchCreditsTotal at signup
  // (app/studio/api/auth/moments-onboard/route.ts), completely independent
  // from freeAiSearchCredits above. Deliberately a SEPARATE field: a real
  // photography studio's free-tier AI-search quota (freeAiSearchCredits,
  // shared across both products) must never move just because this Moments-
  // specific bonus changes. scripts/backfill-moments-credits-bonus.mjs
  // reads this same field for already-onboarded studios.
  momentsWelcomeBonusCredits: number
  // Off by default — see lib/studio/momentsRetentionSweep.ts. Every
  // already-existing Moments gallery has had zero prior warning that
  // age-based deletion could ever happen, so real enforcement (reminder
  // emails + actual deletes) only starts once an owner explicitly flips
  // this on after reviewing a dry-run count. Until then the daily cron only
  // logs what it *would* do.
  momentsRetentionEnforcementEnabled: boolean
}

export interface PricingConfigRecord extends PricingConfig {
  configKey: 'live'
  updatedAt: string
  updatedBy?: string
}
