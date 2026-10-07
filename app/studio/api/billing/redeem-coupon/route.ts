import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { redeemCoupon, type RedeemCouponError } from '@/lib/studio/coupons'
import type { Studio } from '@/types/studio'

const ERROR_MESSAGES: Record<RedeemCouponError, string> = {
  INVALID_CODE: 'That doesn\'t look like a valid code.',
  NOT_FOUND: 'We couldn\'t find that code — check it and try again.',
  DISABLED: 'This code is no longer active.',
  EXPIRED: 'This code has expired.',
  NOT_ELIGIBLE: 'This code isn\'t valid for this account.',
  ALREADY_REDEEMED: 'You\'ve already redeemed this code.',
  LIMIT_REACHED: 'This code has reached its redemption limit.',
}

// Same isIndividual-or-ADMIN/OWNER gate as every other billing route
// (ai-search-topup, storage-topup, verify) — a coupon grant is exactly as
// sensitive as a real top-up from the studio's own perspective (it changes
// their quota), so it gets the exact same "who's allowed to touch billing"
// boundary, just with no Razorpay order involved. All the actual abuse
// protection (rate-limit-equivalent) lives in redeemCoupon's own atomic,
// one-redemption-per-studio-per-code design — see its header comment.
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const studio = await studioGetItem<Studio>(TABLES.studios, { studioId: auth.studioId })
    if (!studio) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    if (!studio.isIndividual && !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { code } = await req.json().catch(() => ({})) as { code?: string }
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ success: false, error: 'INVALID_CODE', message: ERROR_MESSAGES.INVALID_CODE }, { status: 400 })
    }

    const result = await redeemCoupon(auth.studioId, auth.userId, code)
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error, message: ERROR_MESSAGES[result.error] }, { status: 400 })
    }

    // Raw numbers only — the caller (UsageBillingPanel) already knows its
    // own role ('moments' vs 'studio') and momentsCreditDivisor, so it can
    // format a correctly-labeled success message itself rather than this
    // route guessing at a label that's wrong for half its callers.
    return NextResponse.json({ success: true, data: { aiCredits: result.aiCredits, storageGB: result.storageGB } })
  } catch (err) {
    console.error('[billing/redeem-coupon]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
