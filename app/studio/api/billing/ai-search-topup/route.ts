import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { randomUUID } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioPutItem, TABLES } from '@/lib/studio/dynamodb'
import { computeAiAddOnPaise } from '@/constants/studioPricing'
import type { Studio, StudioTransaction } from '@/types/studio'

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID ?? '',
  key_secret: process.env.RAZORPAY_KEY_SECRET ?? '',
})

// Mirrors storage-topup/route.ts exactly, for AI-search (face-indexing)
// credits. Accepts an arbitrary credit amount, priced server-side. Applies
// to the current billing cycle only — see lib/studio/quota.ts. Top-ups are
// Pro+ only — server-side backstop, the UI already redirects Free studios
// to Billing's upgrade options instead of showing this at all.
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

    const { credits } = await req.json().catch(() => ({})) as { credits?: number }
    if (!credits || !Number.isFinite(credits) || credits <= 0 || credits > 100000) {
      return NextResponse.json({ success: false, error: 'INVALID_AMOUNT' }, { status: 400 })
    }

    const amountPaise = computeAiAddOnPaise(credits)
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: randomUUID().slice(0, 40),
    })

    const txnId = randomUUID()
    const pendingTxn: StudioTransaction = {
      txnId,
      studioId: auth.studioId,
      type: 'ai_search_topup',
      packageId: `custom_${credits}credits`,
      amountPaise,
      gbPurchased: 0,
      creditsPurchased: credits,
      razorpayOrderId: order.id,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    await studioPutItem(TABLES.transactions, pendingTxn as unknown as Record<string, unknown>)

    return NextResponse.json({
      success: true,
      data: { orderId: order.id, amountPaise, currency: 'INR', keyId: process.env.RAZORPAY_KEY_ID ?? '', txnId, credits },
    })
  } catch (err) {
    console.error('[billing/ai-search-topup]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
