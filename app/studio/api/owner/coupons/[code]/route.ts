import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, studioDeleteItem, TABLES } from '@/lib/studio/dynamodb'
import { normalizeCouponCode } from '@/lib/studio/coupons'
import type { StudioCoupon } from '@/types/studio'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'OWNER') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const code = normalizeCouponCode(decodeURIComponent(params.code))
    if (!code) return NextResponse.json({ success: false, error: 'INVALID_CODE' }, { status: 400 })

    const { status } = await req.json().catch(() => ({})) as { status?: string }
    if (status !== 'active' && status !== 'disabled') {
      return NextResponse.json({ success: false, error: 'INVALID_STATUS' }, { status: 400 })
    }

    const coupon = await studioGetItem<StudioCoupon>(TABLES.coupons, { code })
    if (!coupon) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    await studioUpdateItem(
      TABLES.coupons, { code },
      'SET #s = :status, updatedAt = :now',
      { ':status': status, ':now': new Date().toISOString() },
      { '#s': 'status' }
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[owner coupon PATCH]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

// Only allowed while redeemedCount is 0 — once a coupon has real redemption
// history, disabling (PATCH status: 'disabled') is the only way to stop it;
// deleting it would orphan the audit trail (StudioCouponRedemption rows
// pointing at a coupon that no longer exists) for no real benefit.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'OWNER') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const code = normalizeCouponCode(decodeURIComponent(params.code))
    if (!code) return NextResponse.json({ success: false, error: 'INVALID_CODE' }, { status: 400 })

    const coupon = await studioGetItem<StudioCoupon>(TABLES.coupons, { code })
    if (!coupon) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    if (coupon.redeemedCount > 0) {
      return NextResponse.json({ success: false, error: 'HAS_REDEMPTIONS', message: 'This code has already been redeemed — disable it instead of deleting.' }, { status: 409 })
    }

    await studioDeleteItem(TABLES.coupons, { code }, 'redeemedCount = :zero')
    return NextResponse.json({ success: true })
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return NextResponse.json({ success: false, error: 'HAS_REDEMPTIONS', message: 'This code has already been redeemed — disable it instead of deleting.' }, { status: 409 })
    }
    console.error('[owner coupon DELETE]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
