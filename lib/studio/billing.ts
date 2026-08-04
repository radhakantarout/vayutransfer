import { randomUUID } from 'crypto'
import { studioGetItem, studioPutItem, studioUpdateItem, TABLES } from './dynamodb'
import { GB, FREE_AI_SEARCH_CREDITS } from '@/constants/studioPricing'
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
export type ApplyTopupInput = StorageTopupInput | AiSearchTopupInput | PlanChangeInput

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
