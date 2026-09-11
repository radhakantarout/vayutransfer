import { randomUUID } from 'crypto'
import { studioGetItem, studioPutItem, studioUpdateItem, TABLES } from './dynamodb'
import { GB, FREE_AI_SEARCH_CREDITS } from '@/constants/studioPricing'
import { FREE_TRIAL_REEL_CREDITS } from '@/constants/videoProviders'
import type { Studio, StudioTransaction, StudioTxnType } from '@/types/studio'

// Idempotent — mirrors lib/wallet.ts#creditWallet's proven txnId-status-check
// pattern exactly, on VayuStudios' own separate transactions table. Safe to
// call twice for the same txnId (client verify + webhook backup both call
// this). Amounts are computed server-side by the caller (the order-creation
// route) from constants/studioPricing.ts's linear rate — never trusted from
// the client — and passed in already-resolved, so this function just applies
// them; it never re-derives a price.

interface StorageTopupInput {
  type: 'storage_topup'
  gb: number
  amountPaise: number
}
interface AiSearchTopupInput {
  type: 'ai_search_topup'
  credits: number
  amountPaise: number
}
interface PlanChangeInput {
  type: 'plan_change'
  planId: 'free' | 'pro' | 'custom'
  storageGB: number
  aiCreditsPerMonth: number
  billingCycle: 'monthly' | 'annual'
  amountPaise: number
}
interface ReelCreditTopupInput {
  type: 'reel_credit_topup'
  credits: number
  amountPaise: number
}
export type ApplyTopupInput = StorageTopupInput | AiSearchTopupInput | PlanChangeInput | ReelCreditTopupInput

export async function applyTopup(
  studioId: string,
  txnId: string,
  input: ApplyTopupInput,
  razorpayOrderId: string,
  razorpayPaymentId: string
): Promise<void> {
  const existing = await studioGetItem<StudioTransaction>(TABLES.transactions, { txnId })
  if (existing?.status === 'success') return

  const now = new Date().toISOString()

  if (input.type === 'storage_topup') {
    // Permanent grant under the new pricing model (no "N months" concept in
    // the marketing copy anymore) — expiresAt: null. Also clears any
    // in-progress overage countdown, since a top-up may bring the studio
    // back under quota immediately.
    const grant = {
      id: randomUUID(),
      bytes: input.gb * GB,
      expiresAt: null,
      source: 'topup' as const,
      purchasedTxnId: txnId,
      createdAt: now,
    }
    await studioUpdateItem(
      TABLES.studios,
      { studioId },
      'SET storageGrants = list_append(if_not_exists(storageGrants, :empty), :grant), updatedAt = :now REMOVE storageOverageStartedAt, storageReminderCount',
      { ':grant': [grant], ':empty': [], ':now': now }
    )
    const txn: StudioTransaction = {
      txnId, studioId, type: 'storage_topup', packageId: `custom_${input.gb}gb`,
      amountPaise: input.amountPaise, gbPurchased: input.gb,
      razorpayOrderId, razorpayPaymentId, status: 'success', createdAt: now,
    }
    await studioPutItem(TABLES.transactions, txn as unknown as Record<string, unknown>)
    return
  }

  if (input.type === 'ai_search_topup') {
    // Applies to the current billing cycle only — cumulative total, never
    // decrements, but gets reset back down to the plan base by
    // lib/studio/quota.ts#syncBillingCycle on the next cycle rollover (no
    // rollover of unused top-up credits, same as the base allotment).
    await studioUpdateItem(
      TABLES.studios,
      { studioId },
      'SET aiSearchCreditsTotal = if_not_exists(aiSearchCreditsTotal, :free) + :credits, updatedAt = :now',
      { ':free': FREE_AI_SEARCH_CREDITS, ':credits': input.credits, ':now': now }
    )
    const txn: StudioTransaction = {
      txnId, studioId, type: 'ai_search_topup', packageId: `custom_${input.credits}credits`,
      amountPaise: input.amountPaise, gbPurchased: 0, creditsPurchased: input.credits,
      razorpayOrderId, razorpayPaymentId, status: 'success', createdAt: now,
    }
    await studioPutItem(TABLES.transactions, txn as unknown as Record<string, unknown>)
    return
  }

  if (input.type === 'reel_credit_topup') {
    // Simple prepaid balance, never expires — unlike ai_search_topup above,
    // this is not scoped to a billing cycle and does not reset (design doc
    // §7). Additive: if_not_exists handles a studio that's never had a
    // reel-credit purchase before.
    await studioUpdateItem(
      TABLES.studios,
      { studioId },
      'SET reelCreditsBalance = if_not_exists(reelCreditsBalance, :zero) + :credits, updatedAt = :now',
      { ':zero': 0, ':credits': input.credits, ':now': now }
    )
    const txn: StudioTransaction = {
      txnId, studioId, type: 'reel_credit_topup', packageId: `reel_${input.credits}credits`,
      amountPaise: input.amountPaise, gbPurchased: 0, creditsPurchased: input.credits,
      razorpayOrderId, razorpayPaymentId, status: 'success', createdAt: now,
    }
    await studioPutItem(TABLES.transactions, txn as unknown as Record<string, unknown>)
    return
  }

  // plan_change — Free→Pro, adjusting Pro's chosen storage/AI/billingCycle,
  // or a manual cycle renewal at the same plan. Deliberately does not touch
  // billingPeriodStart/billingPeriodEnd — the 30-day window keeps rolling on
  // its own fixed schedule regardless of plan changes or top-ups.
  const studio = await studioGetItem<Studio>(TABLES.studios, { studioId })
  const currentAiUsed = studio?.aiSearchCreditsUsed ?? 0
  const cycleDays = input.billingCycle === 'annual' ? 365 : 30
  const planRenewsAt = input.planId === 'free' ? null : new Date(Date.now() + cycleDays * 24 * 60 * 60 * 1000).toISOString()

  await studioUpdateItem(
    TABLES.studios,
    { studioId },
    'SET billingPlanId = :plan, planStorageGB = :sgb, planAiCreditsPerMonth = :ai, billingCycle = :cyc, aiSearchCreditsTotal = :aitotal, updatedAt = :now'
      + (planRenewsAt ? ', planRenewsAt = :renews' : ' REMOVE planRenewsAt'),
    {
      ':plan': input.planId, ':sgb': input.storageGB, ':ai': input.aiCreditsPerMonth, ':cyc': input.billingCycle,
      // Raise the ceiling immediately if the new plan grants more credits
      // than have already been used this cycle; never lower it below what's
      // already been spent (that would make aiSearchCreditsUsed look like
      // it's somehow over 100% of a ceiling that shrank underneath it).
      ':aitotal': Math.max(input.aiCreditsPerMonth, currentAiUsed),
      ':now': now,
      ...(planRenewsAt ? { ':renews': planRenewsAt } : {}),
    }
  )
  const txn: StudioTransaction = {
    txnId, studioId, type: 'plan_change', packageId: `plan_${input.planId}_${input.storageGB}gb_${input.aiCreditsPerMonth}ai`,
    amountPaise: input.amountPaise, gbPurchased: input.storageGB, creditsPurchased: input.aiCreditsPerMonth,
    planId: input.planId, billingCycle: input.billingCycle,
    razorpayOrderId, razorpayPaymentId, status: 'success', createdAt: now,
  }
  await studioPutItem(TABLES.transactions, txn as unknown as Record<string, unknown>)
}

// Spend-side reel-credit ledger (separate from the purchase-side applyTopup
// above). Conditional write guards against going negative — mirrors
// VayuTransfer's own "wallet never goes negative" rule (CLAUDE.md) even
// though nothing in the studio codebase required it before reel credits.
// Call only after checkReelCreditsAvailable (lib/studio/quota.ts) has
// already gated the request; this is the actual charge, not the check.
export async function deductReelCredits(studioId: string, credits: number): Promise<void> {
  await studioUpdateItem(
    TABLES.studios,
    { studioId },
    'ADD reelCreditsBalance :negCredits SET updatedAt = :now',
    { ':negCredits': -credits, ':now': new Date().toISOString(), ':minCredits': credits },
    undefined,
    'reelCreditsBalance >= :minCredits'
  )
}

// Refund path for a job that times out or fails after credits were already
// deducted (design doc §4.3's cron-sweep timeout handling, and ordinary
// generation failure). Additive — safe even if the studio has since spent
// down to zero on something else.
export async function refundReelCredits(studioId: string, credits: number): Promise<void> {
  await studioUpdateItem(
    TABLES.studios,
    { studioId },
    'ADD reelCreditsBalance :credits SET updatedAt = :now',
    { ':credits': credits, ':now': new Date().toISOString() }
  )
}

// Lazily grants the one-time free trial reel credits the first time ANY
// studio (real photography studio or a VayuStudios Moments personal Studio —
// same row shape) tries to generate a reel — call this right after loading
// the Studio and before checkReelCreditsAvailable in every reel-creation
// route (client gallery, guest selfie search, Moments), mirroring the
// established lazy-backfill idiom already used for billing-cycle fields
// (syncBillingCycle) rather than a one-off migration script. Returns the
// studio object with its balance already reflecting the grant so the
// caller's immediately-following credit check doesn't need a second read.
export async function grantFreeTrialReelCreditsIfNeeded(studio: Studio): Promise<Studio> {
  if (studio.reelCreditsFreeTrialUsed) return studio
  try {
    await studioUpdateItem(
      TABLES.studios,
      { studioId: studio.studioId },
      'ADD reelCreditsBalance :credits SET reelCreditsFreeTrialUsed = :used, updatedAt = :now',
      { ':credits': FREE_TRIAL_REEL_CREDITS, ':used': true, ':now': new Date().toISOString(), ':notUsed': false },
      undefined,
      'attribute_not_exists(reelCreditsFreeTrialUsed) OR reelCreditsFreeTrialUsed = :notUsed'
    )
  } catch {
    // Already granted (concurrent request lost the race) or a transient
    // error — either way, never grant twice, and never block reel creation
    // over a free-credit bonus failing to apply.
    return studio
  }
  return { ...studio, reelCreditsBalance: (studio.reelCreditsBalance ?? 0) + FREE_TRIAL_REEL_CREDITS, reelCreditsFreeTrialUsed: true }
}
