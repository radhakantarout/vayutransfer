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
  // AI Image Studio (Kling image generation/editing) — spends from the same
  // unified aiSearchCredits pool as everything else, no new credit type.
  // Units-per-image confirmed against a real Kling API call (2026-09-18):
  // 8 units/image at both 1k and 2k (no 4K tier exists on this account —
  // see types/studio.ts's AiImageResolution comment). Kept as separate
  // 1k/2k fields (not one shared constant) so a future pricing change on
  // just one tier doesn't require a code change.
  klingImageEditPaisePer100kUnits: number
  klingImageEditUnitsPerImage1k: number
  klingImageEditUnitsPerImage2k: number
  // Edit/fusion mode sends 1-10 reference images to Kling alongside the
  // prompt. A real test call with 1 reference image showed NO extra unit
  // cost over pure text-to-image (still 8 units) — this field's nonzero
  // default is therefore a deliberate margin buffer, not a measured Kling
  // cost, kept configurable in case a surcharge appears at a higher
  // reference count than tested. Present from day one rather than assumed
  // free either way: a validated, bounded cost driver (source image count,
  // already capped at 10) being silently absent from the price formula is
  // exactly the class of bug the reel-duration cost leak was.
  klingImageEditUnitsPerReferenceImage: number
  // OpenAI gpt-image-2.5-sunburst — the PRIMARY image gen/edit provider as
  // of 2026-09-20 (Kling's edit path never faithfully preserved input photo
  // identity even after its own schema fix, confirmed via real visual
  // comparison — see lambda/vayustudio-imagegen/providers/openai.js's
  // header). Real billing is TOKEN-based (text/image input, image output,
  // each at a different $/1M-token rate), not unit-based like Kling, so
  // this is a flat total-paise-per-generation estimate per (mode, quality
  // tier) rather than a per-unit rate — calibrated from real `usage` data
  // in actual API responses, rounded up for a safe pre-charge margin (the
  // wallet is deducted BEFORE generation starts, so this must not
  // undercharge relative to what OpenAI actually bills). All four values
  // (generate/edit × medium/high) are directly measured from real calls,
  // not extrapolated — see constants/aiImageEditing.ts's
  // computeOpenAiImageCost for the exact math and real token counts.
  openaiGenerateCostPaiseMedium: number
  openaiGenerateCostPaiseHigh: number
  openaiEditCostPaiseMedium: number
  openaiEditCostPaiseHigh: number
  // Text-to-video (Moments only — Kling's own /text-to-video/{model}
  // endpoint, a genuinely different endpoint from image-to-video, not a
  // parameter on it, confirmed via a real API call 2026-09-18). FLAT rate,
  // not resolution-aware like image-to-video: a real call with
  // resolution:'1080p' billed identically to the default (4 units), and
  // `duration` is silently ignored server-side (every real test produced
  // the same ~5.04s clip regardless of the requested value 5 or 10) — so
  // there is no per-second or per-resolution axis to multiply here, unlike
  // klingUnitsPerSec720/1080 above. CONFIRMED, not provisional: 4 units for
  // one ~5s clip.
  klingTextToVideoUnitsPerVideo: number
  // Config-driven provider swap — mirrors lib/studio/videoProviders/router.ts's
  // enabled/priority pattern but simpler (one active provider at a time,
  // not a priority-ordered fallback list). Plain string (not a union type)
  // deliberately: the Lambda invoke payload just passes it through verbatim
  // (the Lambda itself picks the provider module), validated at runtime
  // against IMAGE_PROVIDERS (lib/pricingConfig.ts) instead of a type change.
  // Cost calculation DOES branch on this (constants/aiImageEditing.ts) since
  // Kling (unit-based) and OpenAI (token-based) have genuinely different
  // pricing shapes, not just different rate numbers. 'kling' and 'openai'
  // both implemented; 'openai' is the default as of 2026-09-20.
  imageProvider: string
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
