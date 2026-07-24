// VayuStudios billing constants — deliberately separate from VayuTransfer's
// constants/pricing.ts. Single source of truth for the capacity-based
// pricing model (Free / Pro-with-slider / Custom): shared by the marketing
// pricing page (app/studio/pricing/PricingContent.tsx), the real Settings
// Billing/Usage tabs, and every backend billing/quota route — a price or
// quota number must never be computed a second way anywhere else.
//
// Verified against real Cloudflare R2 + AWS Rekognition (ap-south-1) costs,
// July 2026, at ~₹97/$1:
//   R2 storage:        $0.015/GB/month (~₹1.45/GB/month) — zero egress fee,
//                       which is why downloads are not metered at all here.
//   Rekognition index:  $0.001/photo (~₹0.10/photo), Group 1 API, first 1M/mo.
// Storage sold at ₹3/100GB-unit nets ~51% margin; AI search at ₹0.30/photo
// nets ~68% — both comfortably inside the target 50-60% gross margin.

export const GB = 1024 * 1024 * 1024

// ── Free plan ────────────────────────────────────────────────────────────
export const FREE_STORAGE_GB = 5
export const FREE_STORAGE_BYTES = FREE_STORAGE_GB * GB
export const FREE_AI_SEARCH_CREDITS = 200

// ── Pro plan ─────────────────────────────────────────────────────────────
// Base price includes a default amount of storage and AI search; anything
// beyond that is priced linearly. Dragging below the included defaults
// never reduces the price below the base — it's a starting price, not a
// per-unit-from-zero calculator.
export const PRO_BASE_PRICE_PAISE = 99900 // ₹999/mo
export const PRO_BASE_STORAGE_GB = 100
export const PRO_BASE_AI_CREDITS = 500
export const PRO_STORAGE_MAX_GB = 1000   // slider ceiling, shown as "1 TB"
export const PRO_STORAGE_STEP_GB = 50
export const PRO_AI_MAX_CREDITS = 10000  // slider ceiling
export const PRO_AI_STEP_CREDITS = 500
export const STORAGE_EXTRA_PAISE_PER_100GB = 30000 // +₹300 per 100 GB
export const AI_EXTRA_PAISE_PER_1000 = 30000       // +₹300 per 1,000 photos

// Same linear rate used for the Pro slider, for both (a) sizing the plan
// itself at checkout/plan-change, and (b) mid-cycle top-ups on top of
// whatever plan a studio is already on (Free included — Free studios can
// still top up without moving to Pro).
export function computeStorageAddOnPaise(extraGB: number): number {
  return Math.round((Math.max(0, extraGB) / 100) * STORAGE_EXTRA_PAISE_PER_100GB)
}
export function computeAiAddOnPaise(extraCredits: number): number {
  return Math.round((Math.max(0, extraCredits) / 1000) * AI_EXTRA_PAISE_PER_1000)
}
// Pro plan price for an arbitrary chosen storage/AI amount (the calculator's
// live price, and the authoritative server-side price for a plan-change).
export function computeProPlanPricePaise(storageGB: number, aiCredits: number): number {
  return PRO_BASE_PRICE_PAISE
    + computeStorageAddOnPaise(storageGB - PRO_BASE_STORAGE_GB)
    + computeAiAddOnPaise(aiCredits - PRO_BASE_AI_CREDITS)
}

// Billing cycle — a fixed 30-day rolling window; annual billing is 10x the
// monthly rate ("2 months free"), still resets AI credits every 30 days.
export const BILLING_CYCLE_DAYS = 30
export const ANNUAL_MONTHS_CHARGED = 10

export const DEFAULT_RETENTION_GRACE_DAYS = 25
export const RETENTION_GRACE_DAY_OPTIONS = [15, 25, 45] as const

export function formatPaiseAsRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN')}`
}

export function formatBytesGB(bytes: number): string {
  return `${(bytes / GB).toFixed(1)} GB`
}
