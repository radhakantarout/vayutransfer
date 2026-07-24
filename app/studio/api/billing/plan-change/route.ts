import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { randomUUID } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioPutItem, TABLES } from '@/lib/studio/dynamodb'
import { applyTopup } from '@/lib/studio/billing'
import {
  FREE_STORAGE_GB, FREE_AI_SEARCH_CREDITS,
  PRO_BASE_STORAGE_GB, PRO_BASE_AI_CREDITS, PRO_STORAGE_MAX_GB, PRO_AI_MAX_CREDITS,
  computeProPlanPricePaise, ANNUAL_MONTHS_CHARGED,
} from '@/constants/studioPricing'
import type { StudioTransaction } from '@/types/studio'

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID ?? '',
  key_secret: process.env.RAZORPAY_KEY_SECRET ?? '',
})

// Free→Pro, adjusting an existing Pro plan's storage/AI/billing cycle, or a
// manual renewal at the current plan (see lib/studio/billing.ts's
// plan_change branch — no auto-debit exists yet, this is always an explicit
// studio-initiated action). Reuses the exact same Razorpay order→verify
// pipeline as top-ups. Free is applied immediately, no payment needed.
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role) || !auth.studioId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({})) as {
      planId?: 'free' | 'pro'
      storageGB?: number
      aiCreditsPerMonth?: number
      billingCycle?: 'monthly' | 'annual'
    }

    if (body.planId === 'free') {
      const now = new Date().toISOString()
      const txnId = randomUUID()
      await applyTopup(
        auth.studioId, txnId,
        { type: 'plan_change', planId: 'free', storageGB: FREE_STORAGE_GB, aiCreditsPerMonth: FREE_AI_SEARCH_CREDITS, billingCycle: 'monthly', amountPaise: 0 },
        'free_plan_no_order', 'free_plan_no_payment'
      )
      return NextResponse.json({ success: true, data: { free: true } })
    }

    if (body.planId !== 'pro') {
      return NextResponse.json({ success: false, error: 'INVALID_PLAN' }, { status: 400 })
    }

    const storageGB = body.storageGB ?? PRO_BASE_STORAGE_GB
    const aiCreditsPerMonth = body.aiCreditsPerMonth ?? PRO_BASE_AI_CREDITS
    const billingCycle = body.billingCycle === 'annual' ? 'annual' : 'monthly'

    if (!Number.isFinite(storageGB) || storageGB < PRO_BASE_STORAGE_GB || storageGB > PRO_STORAGE_MAX_GB) {
      return NextResponse.json({ success: false, error: 'INVALID_STORAGE' }, { status: 400 })
    }
    if (!Number.isFinite(aiCreditsPerMonth) || aiCreditsPerMonth < PRO_BASE_AI_CREDITS || aiCreditsPerMonth > PRO_AI_MAX_CREDITS) {
      return NextResponse.json({ success: false, error: 'INVALID_AI_CREDITS' }, { status: 400 })
    }

    const monthlyPaise = computeProPlanPricePaise(storageGB, aiCreditsPerMonth)
    const amountPaise = billingCycle === 'annual' ? monthlyPaise * ANNUAL_MONTHS_CHARGED : monthlyPaise

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: randomUUID().slice(0, 40),
    })

    const txnId = randomUUID()
    const pendingTxn: StudioTransaction = {
      txnId,
      studioId: auth.studioId,
      type: 'plan_change',
      packageId: `plan_pro_${storageGB}gb_${aiCreditsPerMonth}ai_${billingCycle}`,
      amountPaise,
      gbPurchased: storageGB,
      creditsPurchased: aiCreditsPerMonth,
      planId: 'pro',
      billingCycle,
      razorpayOrderId: order.id,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    await studioPutItem(TABLES.transactions, pendingTxn as unknown as Record<string, unknown>)

    return NextResponse.json({
      success: true,
      data: { orderId: order.id, amountPaise, currency: 'INR', keyId: process.env.RAZORPAY_KEY_ID ?? '', txnId, storageGB, aiCreditsPerMonth, billingCycle },
    })
  } catch (err) {
    console.error('[billing/plan-change]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
