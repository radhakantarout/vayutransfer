import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { randomUUID } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioPutItem, TABLES } from '@/lib/studio/dynamodb'
import { getReelCreditPack, packPricePaise } from '@/constants/videoProviders'
import type { Studio, StudioTransaction } from '@/types/studio'

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID ?? '',
  key_secret: process.env.RAZORPAY_KEY_SECRET ?? '',
})

// Unlike storage/ai-search-topup, this is pack-based (fixed credits/price
// from constants/videoProviders.ts), not an arbitrary linear amount — and
// deliberately NOT gated to Pro/Custom plans (design doc resolved decision
// #3): every credit purchase already covers its own cost + margin under the
// dynamic pricing model, so there's no cross-subsidy risk from Free-plan
// studios buying reel credits the way there would be with a bundled quota.
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role) || !auth.studioId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { packId } = await req.json().catch(() => ({})) as { packId?: string }
    const pack = packId ? getReelCreditPack(packId) : undefined
    if (!pack) {
      return NextResponse.json({ success: false, error: 'INVALID_PACK' }, { status: 400 })
    }

    const studio = await studioGetItem<Studio>(TABLES.studios, { studioId: auth.studioId })
    if (!studio) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    // Annual loyalty discount only applies to a studio actually on annual
    // Pro/Custom billing — never derived from anything client-supplied.
    const amountPaise = packPricePaise(pack, studio.billingCycle)

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: randomUUID().slice(0, 40),
    })

    const txnId = randomUUID()
    const pendingTxn: StudioTransaction = {
      txnId,
      studioId: auth.studioId,
      type: 'reel_credit_topup',
      packageId: pack.id,
      amountPaise,
      gbPurchased: 0,
      creditsPurchased: pack.credits,
      razorpayOrderId: order.id,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    await studioPutItem(TABLES.transactions, pendingTxn as unknown as Record<string, unknown>)

    return NextResponse.json({
      success: true,
      data: { orderId: order.id, amountPaise, currency: 'INR', keyId: process.env.RAZORPAY_KEY_ID ?? '', txnId, credits: pack.credits },
    })
  } catch (err) {
    console.error('[billing/reel-credit-topup]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
