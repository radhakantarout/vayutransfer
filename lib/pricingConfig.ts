import { studioGetItem, studioPutItem, TABLES } from '@/lib/studio/dynamodb'
import type { PricingConfig, PricingConfigRecord } from '@/types/pricingConfig'

// The values every price calculation used before this table existed —
// still the fallback the moment the table/row is empty, so shipping this
// accessor ahead of the real DynamoDB table (not yet provisioned as of
// 2026-09-16, see lib/studio/dynamodb.ts's TABLES.pricingConfig comment) is
// zero-behavior-change. Kept as the literal numbers (not re-imported from
// constants/*.ts) so this file has no compile-time dependency on the files
// it's meant to eventually fully replace.
export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  freeStorageGB: 3,
  freeAiSearchCredits: 200,
  storageExtraPaisePer100GB: 30000, // ₹300 / 100GB
  aiExtraPaisePer1000: 30000,       // ₹300 / 1,000 AI-search credits
  klingCostPaisePerUnit: 1358,      // $0.14/unit @ ~₹97/$1 — real deal (5,000 units/$700)
  klingUnitsPerSec720: 0.8,
  klingUnitsPerSec1080: 1.0,
  fixedOverheadPaisePerReel: 400,
  targetMargin: 0.55,
  minMarginFloor: 0.35,
  creditValuePaise: 8000,           // ₹80 / reel credit (Client Gallery/Guest pool)
  momentsRetentionDays: 17,
  klingImageEditPaisePer100kUnits: 3395000, // $350/100k units @ ~₹97/$1
  klingImageEditUnitsPerImage1k: 8,         // CONFIRMED via real Kling API call, 2026-09-18
  klingImageEditUnitsPerImage2k: 8,         // CONFIRMED via real Kling API call, 2026-09-18 (same as 1k)
  // 0, not a margin-buffer guess — TWO independent real Kling calls
  // (2026-09-18 and 2026-09-20) both billed identically whether or not a
  // reference image was included, confirming no per-reference surcharge
  // exists on this account. See constants/aiImageEditing.ts's comment on
  // this same field and lambda/vayustudio-imagegen/providers/kling.js's
  // header for the full real API facts.
  klingImageEditUnitsPerReferenceImage: 0,
  imageProvider: 'kling',
  klingTextToVideoUnitsPerVideo: 4,  // CONFIRMED via real Kling API call, 2026-09-18 — flat, not resolution-aware
  momentsCreditDivisor: 50,          // 50 raw AI credits = 1 "Moments Credit" (~₹15/credit)
  momentsRetentionEnforcementEnabled: false,
  momentsWelcomeBonusCredits: 120,
}

// Providers with an actual implementation in lambda/vayustudio-imagegen —
// extend this the same commit that adds a new provider module there.
export const IMAGE_PROVIDERS = ['kling'] as const

const CONFIG_KEY = 'live'
const CACHE_TTL_MS = 60_000

let cache: { value: PricingConfig; expiresAt: number } | null = null

// In-process only (no cross-instance invalidation) — a 60s staleness window
// on a value that changes maybe a few times a year is a reasonable trade
// against reading DynamoDB on every single price computation. Any instance
// that already loaded a request re-checks the cache per call, not per
// process lifetime, so a redeploy or restart also self-clears it for free.
export async function getPricingConfig(): Promise<PricingConfig> {
  if (cache && cache.expiresAt > Date.now()) return cache.value
  const row = await studioGetItem<PricingConfigRecord>(TABLES.pricingConfig, { configKey: CONFIG_KEY })
  const value: PricingConfig = { ...DEFAULT_PRICING_CONFIG, ...(row ?? {}) }
  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS }
  return value
}

const POSITIVE_FIELDS: (keyof PricingConfig)[] = [
  'freeStorageGB', 'storageExtraPaisePer100GB', 'aiExtraPaisePer1000',
  'klingCostPaisePerUnit', 'klingUnitsPerSec720', 'klingUnitsPerSec1080',
  'creditValuePaise', 'momentsRetentionDays',
  'klingImageEditPaisePer100kUnits', 'klingImageEditUnitsPerImage1k', 'klingImageEditUnitsPerImage2k',
  'momentsCreditDivisor',
  'momentsWelcomeBonusCredits', 'klingTextToVideoUnitsPerVideo',
]

export function validatePricingConfigPatch(patch: Partial<PricingConfig>): string | null {
  for (const key of POSITIVE_FIELDS) {
    const v = patch[key]
    if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v <= 0)) {
      return `${key} must be a positive number`
    }
  }
  // Not in POSITIVE_FIELDS deliberately — 0 is the real, confirmed-correct
  // value (no per-reference-image surcharge exists on this account, see
  // DEFAULT_PRICING_CONFIG's comment above), so an admin must be able to
  // explicitly set/keep it at 0 rather than that being rejected as invalid.
  if (patch.klingImageEditUnitsPerReferenceImage !== undefined && (typeof patch.klingImageEditUnitsPerReferenceImage !== 'number' || !Number.isFinite(patch.klingImageEditUnitsPerReferenceImage) || patch.klingImageEditUnitsPerReferenceImage < 0)) {
    return 'klingImageEditUnitsPerReferenceImage cannot be negative'
  }
  if (patch.freeAiSearchCredits !== undefined && (typeof patch.freeAiSearchCredits !== 'number' || patch.freeAiSearchCredits < 0)) {
    return 'freeAiSearchCredits cannot be negative'
  }
  if (patch.fixedOverheadPaisePerReel !== undefined && (typeof patch.fixedOverheadPaisePerReel !== 'number' || patch.fixedOverheadPaisePerReel < 0)) {
    return 'fixedOverheadPaisePerReel cannot be negative'
  }
  if (patch.targetMargin !== undefined && (patch.targetMargin < 0 || patch.targetMargin >= 1)) {
    return 'targetMargin must be between 0 and 1'
  }
  if (patch.minMarginFloor !== undefined && (patch.minMarginFloor < 0 || patch.minMarginFloor >= 1)) {
    return 'minMarginFloor must be between 0 and 1'
  }
  if ((patch.targetMargin ?? 0) > 0 && (patch.minMarginFloor ?? 0) > (patch.targetMargin as number)) {
    return 'minMarginFloor cannot exceed targetMargin'
  }
  if (patch.momentsRetentionEnforcementEnabled !== undefined && typeof patch.momentsRetentionEnforcementEnabled !== 'boolean') {
    return 'momentsRetentionEnforcementEnabled must be true or false'
  }
  if (patch.imageProvider !== undefined && !(IMAGE_PROVIDERS as readonly string[]).includes(patch.imageProvider)) {
    return `imageProvider must be one of: ${IMAGE_PROVIDERS.join(', ')}`
  }
  return null
}

// Caller (the owner-only API route) is the actual auth/role gate — this
// function only validates shape, not who's allowed to call it.
export async function savePricingConfig(patch: Partial<PricingConfig>, updatedBy: string): Promise<PricingConfig> {
  const current = await getPricingConfig()
  const next: PricingConfig = { ...current, ...patch }
  const record: PricingConfigRecord = { ...next, configKey: CONFIG_KEY, updatedAt: new Date().toISOString(), updatedBy }
  await studioPutItem(TABLES.pricingConfig, record as unknown as Record<string, unknown>)
  cache = { value: next, expiresAt: Date.now() + CACHE_TTL_MS }
  return next
}
