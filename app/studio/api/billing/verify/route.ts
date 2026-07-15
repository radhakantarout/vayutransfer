import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { applyTopup, findStorageTopupPackage, findDownloadTopupPackage, findAiSearchTopupPackage } from '@/lib/studio/billing'
import { renderReceiptPdf } from '@/lib/studio/receiptPdf'
import { sendStudioReceiptEmail } from '@/lib/aws/ses'
import { formatPaiseAsRupees } from '@/constants/studioPricing'
import type { Studio, StudioTransaction, StudioTxnType, StudioUser } from '@/types/studio'

// Mirrors app/api/wallet/verify/route.ts's HMAC verification exactly, on a
// separate VayuStudios-only path. This is the primary confirmation route,
// called by the client right after Razorpay checkout succeeds; the webhook
// (app/api/webhooks/razorpay-studio) is a backup that calls the same
// idempotent applyTopup().
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
      type?: StudioTxnType
      packageId?: string
    }
    const { razorpayPaymentId, razorpayOrderId, razorpaySignature, txnId, type, packageId } = body

    if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature || !txnId || !type || !packageId) {
      return NextResponse.json({ success: false, error: 'MISSING_PARAMS' }, { status: 400 })
    }

    const secret = process.env.RAZORPAY_KEY_SECRET ?? ''
    const payload = `${razorpayOrderId}|${razorpayPaymentId}`
    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex')
    if (expectedSignature !== razorpaySignature) {
      return NextResponse.json({ success: false, error: 'SIGNATURE_INVALID' }, { status: 400 })
    }

    const pkg = type === 'storage_topup'
      ? findStorageTopupPackage(packageId)
      : type === 'ai_search_topup'
        ? findAiSearchTopupPackage(packageId)
        : findDownloadTopupPackage(packageId)
    if (!pkg) {
      return NextResponse.json({ success: false, error: 'INVALID_PACKAGE' }, { status: 400 })
    }

    await applyTopup(auth.studioId, txnId, type, packageId, razorpayOrderId, razorpayPaymentId)

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
        const pdf = await renderReceiptPdf(studio.name, txn)
        const label = type === 'storage_topup' ? pkg.label : pkg.label
        await sendStudioReceiptEmail(adminUser.email, studio.name, pdf, label, pkg.pricePaise)
      } catch (err) {
        console.error('[billing/verify] receipt email failed', err)
      }
    })()

    return NextResponse.json({
      success: true,
      data: { amountFormatted: formatPaiseAsRupees(pkg.pricePaise) },
    })
  } catch (err) {
    console.error('[billing/verify]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
