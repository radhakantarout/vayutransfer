import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { randomUUID } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioPutItem, TABLES } from '@/lib/studio/dynamodb'
import { findAiSearchTopupPackage } from '@/lib/studio/billing'
import type { StudioTransaction } from '@/types/studio'

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID ?? '',
  key_secret: process.env.RAZORPAY_KEY_SECRET ?? '',
})

// Mirrors storage-topup/route.ts exactly, for AI-search (face-indexing) credits.
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role) || !auth.studioId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { packageId } = await req.json().catch(() => ({})) as { packageId?: string }
    const pkg = packageId ? findAiSearchTopupPackage(packageId) : null
    if (!pkg) {
      return NextResponse.json({ success: false, error: 'INVALID_PACKAGE' }, { status: 400 })
    }

    const order = await razorpay.orders.create({
      amount: pkg.pricePaise,
      currency: 'INR',
      receipt: randomUUID().slice(0, 40),
    })

    const txnId = randomUUID()
    const pendingTxn: StudioTransaction = {
      txnId,
      studioId: auth.studioId,
      type: 'ai_search_topup',
      packageId: pkg.id,
      amountPaise: pkg.pricePaise,
      gbPurchased: 0,
      creditsPurchased: pkg.credits,
      razorpayOrderId: order.id,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    await studioPutItem(TABLES.transactions, pendingTxn as unknown as Record<string, unknown>)

    return NextResponse.json({
      success: true,
      data: {
        orderId: order.id,
        amountPaise: pkg.pricePaise,
        currency: 'INR',
        keyId: process.env.RAZORPAY_KEY_ID ?? '',
        txnId,
        packageId: pkg.id,
      },
    })
  } catch (err) {
    console.error('[billing/ai-search-topup]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
