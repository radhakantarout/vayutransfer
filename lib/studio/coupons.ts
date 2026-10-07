import { randomUUID, randomBytes } from 'crypto'
import { studioGetItem, studioTransactWrite, TABLES, type StudioTransactOp } from './dynamodb'
import { GB, FREE_AI_SEARCH_CREDITS } from '@/constants/studioPricing'
import type { StudioCoupon, StudioCouponRedemption, StudioTransaction } from '@/types/studio'

// Generic coupon redemption — real money-equivalent credits/storage granted
// by code, redeemable by any authenticated studio (not an admin-only
// back-door). Built 2026-10-07 to replace the ad-hoc AWS-CLI manual grants
// this project kept needing for test accounts, in a form real users can
// also use safely. Two things make this "safe to expose to real users"
// rather than just a faster version of the CLI hack:
//
// 1. ATOMICITY — a single DynamoDB TransactWriteItems call does all of:
//    claim this studio's one-time redemption slot, claim the coupon's
//    global redemption slot, apply the actual credit/storage grant, and
//    write the audit record. All four commit together or none do — there
//    is no window where a redemption is "claimed" but not yet credited, or
//    credited twice under concurrent requests (e.g. a user double-clicking
//    Redeem, or two browser tabs). This is strictly tighter than how even
//    the real Razorpay top-up path works today (billing.ts#applyTopup's
//    own idempotency check is a plain read-then-write, not atomic) —
//    deliberately held to a higher bar here specifically because a coupon
//    has no payment gateway acting as a natural second line of defense.
// 2. BOUNDED COST — every coupon has an explicit maxRedemptions (never
//    "unlimited") and sane per-coupon caps on aiCredits/storageGB (see
//    MAX_COUPON_* below), so a single coupon's worst-case total cost
//    exposure (grant size × max redemptions) is always a small, computable
//    number — not an open-ended liability if a code ever leaked or got
//    shared further than intended.
export const MAX_COUPON_AI_CREDITS = 1_000_000
export const MAX_COUPON_STORAGE_GB = 1_000
export const MAX_COUPON_MAX_REDEMPTIONS = 100_000
export const MIN_COUPON_CODE_LENGTH = 4
export const MAX_COUPON_CODE_LENGTH = 40

// Uppercase alnum + dash/underscore only — keeps codes easy to read/type
// aloud/share over chat, and sidesteps any ambiguity about whether a code
// is case-sensitive (it never is, by construction).
const CODE_PATTERN = /^[A-Z0-9_-]+$/

export function normalizeCouponCode(raw: string): string | null {
  const code = raw.trim().toUpperCase()
  if (code.length < MIN_COUPON_CODE_LENGTH || code.length > MAX_COUPON_CODE_LENGTH) return null
  if (!CODE_PATTERN.test(code)) return null
  return code
}

// Used when an admin leaves the code field blank at creation time — 10
// base32-ish characters (Crockford alphabet minus easily-confused chars)
// from a real CSPRNG, ~50 bits of entropy. Deliberately high-entropy by
// default: a short, guessable code is only appropriate for an intentionally
// public marketing coupon, which an admin opts into by typing their own
// code instead of accepting this default.
export function generateCouponCode(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  const bytes = randomBytes(10)
  let code = ''
  for (let i = 0; i < 10; i++) code += alphabet[bytes[i] % alphabet.length]
  return code
}

export type RedeemCouponError =
  | 'INVALID_CODE' | 'NOT_FOUND' | 'DISABLED' | 'EXPIRED' | 'NOT_ELIGIBLE'
  | 'ALREADY_REDEEMED' | 'LIMIT_REACHED'

export type RedeemCouponResult =
  | { ok: true; aiCredits: number; storageGB: number }
  | { ok: false; error: RedeemCouponError }

// The one function that actually grants anything. Does a plain read first
// purely to return a specific, helpful error (expired/disabled/wrong
// studio/not found) without spending a transaction — but that read is NEVER
// trusted for the two things that actually matter for correctness
// (per-studio double-redemption, the global redemption cap), which are
// re-checked as real atomic conditions in the transaction below. A stale
// pre-read can only ever cause a spurious-but-safe rejection on the real
// transaction, never an incorrect grant.
export async function redeemCoupon(studioId: string, userId: string, rawCode: string): Promise<RedeemCouponResult> {
  const code = normalizeCouponCode(rawCode)
  if (!code) return { ok: false, error: 'INVALID_CODE' }

  const coupon = await studioGetItem<StudioCoupon>(TABLES.coupons, { code })
  if (!coupon) return { ok: false, error: 'NOT_FOUND' }
  if (coupon.status !== 'active') return { ok: false, error: 'DISABLED' }
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= Date.now()) return { ok: false, error: 'EXPIRED' }
  if (coupon.restrictToStudioId && coupon.restrictToStudioId !== studioId) return { ok: false, error: 'NOT_ELIGIBLE' }
  if (coupon.redeemedCount >= coupon.maxRedemptions) return { ok: false, error: 'LIMIT_REACHED' }

  const now = new Date().toISOString()
  const txnId = randomUUID()

  const setClauses = ['updatedAt = :now']
  const removeClauses: string[] = []
  const grantValues: Record<string, unknown> = { ':now': now }
  if (coupon.aiCredits > 0) {
    setClauses.push('aiSearchCreditsTotal = if_not_exists(aiSearchCreditsTotal, :freeAi) + :aiCredits')
    grantValues[':freeAi'] = FREE_AI_SEARCH_CREDITS
    grantValues[':aiCredits'] = coupon.aiCredits
  }
  if (coupon.storageGB > 0) {
    // Same shape as billing.ts#applyTopup's own storage_topup grant —
    // permanent (expiresAt: null), appended to the list rather than
    // replacing it, and clears any in-progress overage countdown since this
    // grant may bring the studio back under quota immediately.
    setClauses.push('storageGrants = list_append(if_not_exists(storageGrants, :empty), :grant)')
    grantValues[':empty'] = []
    grantValues[':grant'] = [{
      id: randomUUID(), bytes: coupon.storageGB * GB, expiresAt: null,
      source: 'topup', purchasedTxnId: txnId, createdAt: now,
    }]
    removeClauses.push('storageOverageStartedAt', 'storageReminderCount')
  }

  const txn: StudioTransaction = {
    txnId, studioId, type: 'coupon_redemption',
    packageId: `coupon_${code}`,
    amountPaise: 0,
    gbPurchased: coupon.storageGB,
    creditsPurchased: coupon.aiCredits,
    couponCode: code,
    status: 'success',
    createdAt: now,
  }

  const redemption: StudioCouponRedemption = { code, studioId, txnId, redeemedByUserId: userId, redeemedAt: now }

  const ops: StudioTransactOp[] = [
    // Op 0 — per-studio dedup guard. The composite key (code, studioId) IS
    // the guard: this Put can only ever succeed once for this exact pair,
    // no matter how many concurrent requests arrive.
    { type: 'Put', table: TABLES.couponRedemptions, item: redemption as unknown as Record<string, unknown>, conditionExpression: 'attribute_not_exists(code)' },
    // Op 1 — global cap + still-active guard, re-checked against the LIVE
    // item attributes (redeemedCount < maxRedemptions compares two
    // attributes of the same row directly, not a value captured at the
    // pre-read above) — correct even if another redemption or an admin
    // edit landed between the read and this transaction.
    {
      type: 'Update', table: TABLES.coupons, key: { code },
      updateExpression: 'ADD redeemedCount :one SET updatedAt = :now2',
      expressionValues: { ':one': 1, ':now2': now, ':active': 'active' },
      expressionNames: { '#s': 'status' },
      conditionExpression: '#s = :active AND redeemedCount < maxRedemptions',
    },
    // Op 2 — the actual grant. No condition needed: by the time DynamoDB
    // evaluates this op, ops 0 and 1 have already passed their conditions
    // (transactions are all-or-nothing), so it's always safe to apply.
    {
      type: 'Update', table: TABLES.studios, key: { studioId },
      updateExpression: `SET ${setClauses.join(', ')}${removeClauses.length ? ` REMOVE ${removeClauses.join(', ')}` : ''}`,
      expressionValues: grantValues,
    },
    // Op 3 — audit trail, same table/shape every other billing event uses.
    { type: 'Put', table: TABLES.transactions, item: txn as unknown as Record<string, unknown> },
  ]

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await studioTransactWrite(ops)
      return { ok: true, aiCredits: coupon.aiCredits, storageGB: coupon.storageGB }
    } catch (err) {
      const name = (err as { name?: string }).name
      const reasons = (err as { CancellationReasons?: { Code?: string }[] }).CancellationReasons
      if (name === 'TransactionCanceledException' && reasons?.[0]?.Code === 'ConditionalCheckFailed') {
        return { ok: false, error: 'ALREADY_REDEEMED' }
      }
      if (name === 'TransactionCanceledException' && reasons?.[1]?.Code === 'ConditionalCheckFailed') {
        return { ok: false, error: 'LIMIT_REACHED' }
      }
      // Real (non-conditional) transaction contention — another transaction
      // touched one of these exact rows at the same instant. Nothing
      // committed, safe to retry once (same pattern already used by
      // ai-images/[imageId]/save's own studioTransactWrite call).
      if (name === 'TransactionCanceledException' && reasons?.some((r) => r.Code === 'TransactionConflict') && attempt === 0) {
        continue
      }
      throw err
    }
  }
  throw new Error('redeemCoupon: unreachable — retry loop exited without returning or throwing')
}
