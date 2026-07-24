import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { randomUUID } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioPutItem, TABLES } from '@/lib/studio/dynamodb'
import { computeStorageAddOnPaise } from '@/constants/studioPricing'
import type { Studio, StudioTransaction } from '@/types/studio'

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID ?? '',
  key_secret: process.env.RAZORPAY_KEY_SECRET ?? '',
})

// Mirrors app/api/wallet/topup/route.ts's shape — a separate, VayuStudios-only
// implementation on its own transactions table, not a shared code path.
// Accepts an arbitrary GB amount (from the Pro plan's live calculator) —
// price is always computed here from the shared linear rate, never trusted
// from the client. Top-ups are Pro+ only (the UI already redirects Free
// studios to Billing's upgrade options instead of showing this at all —
// this is the server-side backstop, not the primary UX).
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role) || !auth.studioId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const studio = await studioGetItem<Studio>(TABLES.studios, { studioId: auth.studioId })
    if (!studio || (studio.billingPlanId ?? 'free') === 'free') {
      return NextResponse.json({ success: false, error: 'PLAN_REQUIRED', message: 'Top-ups are available on Pro and Custom plans. Upgrade in Settings → Billing first.' }, { status: 403 })
    }

    const { gb } = await req.json().catch(() => ({})) as { gb?: number }
    if (!gb || !Number.isFinite(gb) || gb <= 0 || gb > 10000) {
      return NextResponse.json({ success: false, error: 'INVALID_AMOUNT' }, { status: 400 })
    }

    const amountPaise = computeStorageAddOnPaise(gb)
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: randomUUID().slice(0, 40),
    })

    const txnId = randomUUID()
    const pendingTxn: StudioTransaction = {
      txnId,
      studioId: auth.studioId,
      type: 'storage_topup',
      packageId: `custom_${gb}gb`,
      amountPaise,
      gbPurchased: gb,
      razorpayOrderId: order.id,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    await studioPutItem(TABLES.transactions, pendingTxn as unknown as Record<string, unknown>)

    return NextResponse.json({
      success: true,
      data: { orderId: order.id, amountPaise, currency: 'INR', keyId: process.env.RAZORPAY_KEY_ID ?? '', txnId, gb },
    })
  } catch (err) {
    console.error('[billing/storage-topup]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
