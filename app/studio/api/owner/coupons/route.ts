import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioScanTable, studioPutItem, TABLES } from '@/lib/studio/dynamodb'
import {
  normalizeCouponCode, generateCouponCode,
  MAX_COUPON_AI_CREDITS, MAX_COUPON_STORAGE_GB, MAX_COUPON_MAX_REDEMPTIONS,
} from '@/lib/studio/coupons'
import type { StudioCoupon } from '@/types/studio'

// Owner-only (support@vayutransfer.com), same role gate as every other
// /studio/api/owner/* route. Low enough expected volume (a handful of
// coupons, not thousands) that a full-table scan here is fine — matches
// the precedent already set by owner/studios' own list route.
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'OWNER') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    const coupons = await studioScanTable<StudioCoupon>(TABLES.coupons)
    coupons.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return NextResponse.json({ success: true, data: coupons })
  } catch (err) {
    console.error('[owner coupons GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'OWNER') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({})) as {
      code?: string
      aiCredits?: number
      storageGB?: number
      maxRedemptions?: number
      restrictToStudioId?: string
      expiresAt?: string | null
      note?: string
    }

    const code = body.code && body.code.trim().length > 0
      ? normalizeCouponCode(body.code)
      : generateCouponCode()
    if (!code) {
      return NextResponse.json({ success: false, error: 'INVALID_CODE', message: 'Codes must be 4-40 characters, letters/numbers/dashes/underscores only.' }, { status: 400 })
    }

    const aiCredits = Number(body.aiCredits ?? 0)
    const storageGB = Number(body.storageGB ?? 0)
    if (!Number.isFinite(aiCredits) || aiCredits < 0 || aiCredits > MAX_COUPON_AI_CREDITS) {
      return NextResponse.json({ success: false, error: 'INVALID_AI_CREDITS', message: `AI credits must be between 0 and ${MAX_COUPON_AI_CREDITS}.` }, { status: 400 })
    }
    if (!Number.isFinite(storageGB) || storageGB < 0 || storageGB > MAX_COUPON_STORAGE_GB) {
      return NextResponse.json({ success: false, error: 'INVALID_STORAGE_GB', message: `Storage must be between 0 and ${MAX_COUPON_STORAGE_GB} GB.` }, { status: 400 })
    }
    if (aiCredits === 0 && storageGB === 0) {
      return NextResponse.json({ success: false, error: 'EMPTY_GRANT', message: 'Grant at least some AI credits or storage.' }, { status: 400 })
    }

    const maxRedemptions = Number(body.maxRedemptions ?? 1)
    if (!Number.isInteger(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > MAX_COUPON_MAX_REDEMPTIONS) {
      return NextResponse.json({ success: false, error: 'INVALID_MAX_REDEMPTIONS', message: `Max redemptions must be between 1 and ${MAX_COUPON_MAX_REDEMPTIONS}.` }, { status: 400 })
    }

    const expiresAt = typeof body.expiresAt === 'string' && body.expiresAt.trim().length > 0 ? body.expiresAt : null
    if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) {
      return NextResponse.json({ success: false, error: 'INVALID_EXPIRY' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const coupon: StudioCoupon = {
      code, aiCredits, storageGB, maxRedemptions, redeemedCount: 0,
      restrictToStudioId: body.restrictToStudioId?.trim() || undefined,
      expiresAt,
      status: 'active',
      note: body.note?.trim().slice(0, 500) || undefined,
      createdByUserId: auth.userId,
      createdAt: now, updatedAt: now,
    }

    // Conditional — a hand-typed code could collide with an existing one;
    // generated codes are high-entropy enough this is only a real concern
    // for hand-typed codes, but the guard costs nothing either way.
    try {
      await studioPutItem(TABLES.coupons, coupon as unknown as Record<string, unknown>, 'attribute_not_exists(code)')
    } catch (err) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
        return NextResponse.json({ success: false, error: 'CODE_EXISTS', message: 'That code is already in use — pick another.' }, { status: 409 })
      }
      throw err
    }

    return NextResponse.json({ success: true, data: coupon })
  } catch (err) {
    console.error('[owner coupons POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
