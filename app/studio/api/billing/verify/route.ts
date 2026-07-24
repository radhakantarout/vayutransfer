import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { applyTopup, type ApplyTopupInput } from '@/lib/studio/billing'
import { renderReceiptPdf } from '@/lib/studio/receiptPdf'
import { formatTxnLabel } from '@/lib/studio/receiptLabel'
import { sendStudioReceiptEmail } from '@/lib/aws/ses'
import { formatPaiseAsRupees } from '@/constants/studioPricing'
import type { Studio, StudioTransaction, StudioUser } from '@/types/studio'

// Mirrors app/api/wallet/verify/route.ts's HMAC verification exactly, on a
// separate VayuStudios-only path. Amounts/quantities are always read from
// the pending StudioTransaction row the order-creation route already wrote
// server-side — never re-derived from anything the client sends here, so a
// tampered client request can't change what gets credited.
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role) || !auth.studioId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({})) as {
      razorpayPaymentId?: string
      razorpayOrderId?: string
      razorpaySignature?: string
      txnId?: string
    }
    const { razorpayPaymentId, razorpayOrderId, razorpaySignature, txnId } = body

    if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature || !txnId) {
      return NextResponse.json({ success: false, error: 'MISSING_PARAMS' }, { status: 400 })
    }

    const pendingTxn = await studioGetItem<StudioTransaction>(TABLES.transactions, { txnId })
    if (!pendingTxn || pendingTxn.studioId !== auth.studioId || pendingTxn.razorpayOrderId !== razorpayOrderId) {
      return NextResponse.json({ success: false, error: 'INVALID_TXN' }, { status: 400 })
    }

    const secret = process.env.RAZORPAY_KEY_SECRET ?? ''
    const payload = `${razorpayOrderId}|${razorpayPaymentId}`
    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex')
    if (expectedSignature !== razorpaySignature) {
      return NextResponse.json({ success: false, error: 'SIGNATURE_INVALID' }, { status: 400 })
    }

    const input: ApplyTopupInput = pendingTxn.type === 'storage_topup'
      ? { type: 'storage_topup', gb: pendingTxn.gbPurchased, amountPaise: pendingTxn.amountPaise }
      : pendingTxn.type === 'ai_search_topup'
        ? { type: 'ai_search_topup', credits: pendingTxn.creditsPurchased ?? 0, amountPaise: pendingTxn.amountPaise }
        : {
            type: 'plan_change',
            planId: pendingTxn.planId ?? 'pro',
            storageGB: pendingTxn.gbPurchased,
            aiCreditsPerMonth: pendingTxn.creditsPurchased ?? 0,
            billingCycle: pendingTxn.billingCycle ?? 'monthly',
            amountPaise: pendingTxn.amountPaise,
          }

    await applyTopup(auth.studioId, txnId, input, razorpayOrderId, razorpayPaymentId)

    // Fire-and-forget PDF receipt — a failure here never blocks the payment itself
    void (async () => {
      try {
        const [studio, txn] = await Promise.all([
          studioGetItem<Studio>(TABLES.studios, { studioId: auth.studioId }),
          studioGetItem<StudioTransaction>(TABLES.transactions, { txnId }),
        ])
        if (!studio || !txn) return
        const adminUser = await studioGetItem<StudioUser>(TABLES.users, { userId: auth.userId }).catch(() => null)
        if (!adminUser?.email) return
        const label = formatTxnLabel(txn)
        const pdf = await renderReceiptPdf(studio.name, txn)
        await sendStudioReceiptEmail(adminUser.email, studio.name, pdf, label, txn.amountPaise)
      } catch (err) {
        console.error('[billing/verify] receipt email failed', err)
      }
    })()

    return NextResponse.json({
      success: true,
      data: { amountFormatted: formatPaiseAsRupees(pendingTxn.amountPaise) },
    })
  } catch (err) {
    console.error('[billing/verify]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
