import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { logAudit } from '@/lib/audit'
import { creditWallet } from '@/lib/wallet'
import { WALLET_TOPUP_TIERS } from '@/constants/pricing'
import { queryItems } from '@/lib/aws/dynamodb'
import type { Transaction } from '@/types'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-razorpay-signature') ?? ''

  void logAudit({
    eventType: 'WEBHOOK_RECEIVED',
    actor: 'razorpay',
    outcome: 'success',
    metadata: { signaturePresent: !!signature },
  })

  // Verify webhook signature
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? ''
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex')

  if (expectedSignature !== signature) {
    void logAudit({
      eventType: 'WEBHOOK_REJECTED',
      actor: 'razorpay',
      outcome: 'failure',
      errorCode: 'SIGNATURE_MISMATCH',
    })
    // Always return 200 to prevent Razorpay retries on intentional rejections
    return NextResponse.json({ received: true })
  }

  void logAudit({
    eventType: 'WEBHOOK_VERIFIED',
    actor: 'razorpay',
    outcome: 'success',
  })

  let event: { event: string; payload?: { payment?: { entity?: { order_id?: string; id?: string } } } }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ received: true })
  }

  // Handle payment captured (backup idempotent credit)
  if (event.event === 'payment.captured') {
    const razorpayOrderId = event.payload?.payment?.entity?.order_id
    const razorpayPaymentId = event.payload?.payment?.entity?.id

    if (razorpayOrderId) {
      try {
        // Find pending transaction for this order
        const txnTable = process.env.DYNAMO_TRANSACTIONS_TABLE ?? 'vayu-transactions'
        // Query by walletId is not possible here without it — scan is not ideal.
        // In practice, the /verify endpoint handles payment. This webhook is backup only.
        // We log it — if verify already processed it, creditWallet is idempotent via txnId check.
        console.info('[webhook] payment.captured received for order:', razorpayOrderId)
      } catch (err) {
        console.error('[webhook] error processing payment.captured:', err)
      }
    }
  }

  return NextResponse.json({ received: true })
}
