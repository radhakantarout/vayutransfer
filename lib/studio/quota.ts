import { studioUpdateItem, TABLES } from './dynamodb'
import { FREE_STORAGE_BYTES, FREE_STORAGE_GB, FREE_AI_SEARCH_CREDITS, GB, BILLING_CYCLE_DAYS } from '@/constants/studioPricing'
import type { Studio } from '@/types/studio'

// Single source of truth for "how much storage/AI search can this studio
// use right now" — every upload/AI-index route and every usage-display
// route (admin/stats, Settings Billing/Usage) reads through here so the
// enforcement number and the displayed number can never drift apart.
// Replaces lib/studio/usage.ts, which also tracked downloads — removed
// entirely under the R2 (zero-egress-fee) pricing model.

export function planStorageBytes(studio: Studio): number {
  return (studio.planStorageGB ?? FREE_STORAGE_GB) * GB
}

export function planAiCredits(studio: Studio): number {
  return studio.planAiCreditsPerMonth ?? FREE_AI_SEARCH_CREDITS
}

// Total currently-active storage grant: the plan's base allotment + any
// unexpired top-up grants. Storage top-ups purchased under the new pricing
// model are permanent (expiresAt: null) — only legacy pre-migration grants
// carry a real expiry, honored here for backward compatibility.
export function activeStorageGrantBytes(studio: Studio): number {
  const now = Date.now()
  const topupBytes = (studio.storageGrants ?? [])
    .filter((g) => g.source === 'topup' && (!g.expiresAt || new Date(g.expiresAt).getTime() > now))
    .reduce((sum, g) => sum + g.bytes, 0)
  return planStorageBytes(studio) + topupBytes
}

// billableStorageBytes only ever decrements via best-effort ADD with no
// floor guard (matches this codebase's existing totalFiles/projectCount
// decrement pattern) — clamp here rather than adding conditional-write
// complexity to every delete path.
export function currentStorageBytes(studio: Studio): number {
  return Math.max(0, studio.billableStorageBytes ?? 0)
}

export function isOverStorageQuota(studio: Studio): boolean {
  return currentStorageBytes(studio) > activeStorageGrantBytes(studio)
}

export function storageUsagePct(studio: Studio): number {
  const grant = activeStorageGrantBytes(studio)
  return grant > 0 ? Math.round((currentStorageBytes(studio) / grant) * 100) : 0
}

// Would adding `extraBytes` more storage push this studio over its quota?
// Soft gate, checked before issuing a presigned upload URL — real size isn't
// known until upload-complete, so this can't be a hard reservation, but it
// stops the common case (already full, about to add more) before the studio
// wastes time picking files.
export function checkStorageAvailable(studio: Studio, extraBytes = 0): { ok: boolean; usedBytes: number; quotaBytes: number; usedPct: number } {
  const usedBytes = currentStorageBytes(studio)
  const quotaBytes = activeStorageGrantBytes(studio)
  return { ok: usedBytes + extraBytes <= quotaBytes, usedBytes, quotaBytes, usedPct: storageUsagePct(studio) }
}

// This cycle's AI-search credit ceiling — plan base + any top-ups bought
// during the current cycle (top-up credits don't roll over past a reset,
// same "use it or lose it" rule as the base allotment).
export function aiCreditsQuota(studio: Studio): number {
  return studio.aiSearchCreditsTotal ?? planAiCredits(studio)
}

// Cumulative photos indexed by Rekognition this cycle — never decremented
// on delete (the cost was already incurred), only reset by resetCycleIfDue.
export function aiCreditsUsed(studio: Studio): number {
  return studio.aiSearchCreditsUsed ?? 0
}

export function isOverAiQuota(studio: Studio): boolean {
  return aiCreditsUsed(studio) >= aiCreditsQuota(studio)
}

export function aiUsagePct(studio: Studio): number {
  const quota = aiCreditsQuota(studio)
  return quota > 0 ? Math.round((aiCreditsUsed(studio) / quota) * 100) : 0
}

export function checkAiCreditsAvailable(studio: Studio, count: number): { ok: boolean; usedCredits: number; quotaCredits: number; usedPct: number } {
  const usedCredits = aiCreditsUsed(studio)
  const quotaCredits = aiCreditsQuota(studio)
  return { ok: usedCredits + count <= quotaCredits, usedCredits, quotaCredits, usedPct: aiUsagePct(studio) }
}

// Shared green/orange/red banding used by every usage bar in the UI —
// <70% green, 70-80% orange, >80% red.
export type UsageBand = 'green' | 'orange' | 'red'
export function usageBand(pct: number): UsageBand {
  if (pct > 80) return 'red'
  if (pct >= 70) return 'orange'
  return 'green'
}

// Lazily brings a studio's billing-cycle fields up to date — call this
// right after loading a Studio record in any route that reads or enforces
// quota (admin/stats, upload/index enforcement routes). Self-heals even if
// the daily cron (cron/storage-check) is delayed, and safely backfills
// studios that predate the billing-cycle fields without disturbing their
// already-accumulated usage numbers.
export async function syncBillingCycle(studio: Studio): Promise<Studio> {
  const now = new Date()

  if (!studio.billingPeriodStart || !studio.billingPeriodEnd) {
    // First time seeing this studio since the cycle fields were introduced —
    // start a fresh 30-day window now. Deliberately does NOT touch
    // aiSearchCreditsUsed/Total or billingPlanId/planStorageGB if already
    // set — only fills in what's missing.
    const periodStart = now.toISOString()
    const periodEnd = new Date(now.getTime() + BILLING_CYCLE_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const billingPlanId = studio.billingPlanId ?? 'free'
    const planStorageGB = studio.planStorageGB ?? FREE_STORAGE_GB
    const planAiCreditsPerMonth = studio.planAiCreditsPerMonth ?? FREE_AI_SEARCH_CREDITS
    const billingCycle = studio.billingCycle ?? 'monthly'

    await studioUpdateItem(
      TABLES.studios,
      { studioId: studio.studioId },
      'SET billingPeriodStart = :ps, billingPeriodEnd = :pe, billingPlanId = :plan, planStorageGB = :sgb, planAiCreditsPerMonth = :ai, billingCycle = :cyc, updatedAt = :now',
      { ':ps': periodStart, ':pe': periodEnd, ':plan': billingPlanId, ':sgb': planStorageGB, ':ai': planAiCreditsPerMonth, ':cyc': billingCycle, ':now': now.toISOString() }
    )
    return { ...studio, billingPeriodStart: periodStart, billingPeriodEnd: periodEnd, billingPlanId, planStorageGB, planAiCreditsPerMonth, billingCycle }
  }

  if (now.getTime() < new Date(studio.billingPeriodEnd).getTime()) {
    return studio // cycle still active, nothing to do
  }

  // Roll forward — possibly more than one missed cycle if the cron/this
  // lazy check hasn't run in a while. AI credits reset to just the plan
  // base; any unused top-up headroom from the expired cycle does not
  // carry forward (storage top-ups are unaffected — they're permanent
  // grants tracked separately in storageGrants, not part of this reset).
  let periodStart = new Date(studio.billingPeriodEnd)
  let periodEnd = new Date(periodStart.getTime() + BILLING_CYCLE_DAYS * 24 * 60 * 60 * 1000)
  while (periodEnd.getTime() <= now.getTime()) {
    periodStart = periodEnd
    periodEnd = new Date(periodStart.getTime() + BILLING_CYCLE_DAYS * 24 * 60 * 60 * 1000)
  }
  const newAiTotal = planAiCredits(studio)

  await studioUpdateItem(
    TABLES.studios,
    { studioId: studio.studioId },
    'SET billingPeriodStart = :ps, billingPeriodEnd = :pe, aiSearchCreditsUsed = :zero, aiSearchCreditsTotal = :total, updatedAt = :now',
    { ':ps': periodStart.toISOString(), ':pe': periodEnd.toISOString(), ':zero': 0, ':total': newAiTotal, ':now': now.toISOString() }
  )
  return { ...studio, billingPeriodStart: periodStart.toISOString(), billingPeriodEnd: periodEnd.toISOString(), aiSearchCreditsUsed: 0, aiSearchCreditsTotal: newAiTotal }
}

// Re-exported for callers that only need the raw free-baseline byte count
// (e.g. a studio with no plan fields at all yet).
export { FREE_STORAGE_BYTES }
