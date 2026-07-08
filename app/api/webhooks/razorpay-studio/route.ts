import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// Backup webhook for VayuStudios billing — separate endpoint, separate
// transactions table from VayuTransfer's app/api/webhooks/razorpay. Mirrors
// that route's actual behavior exactly: the primary confirmation path is
// app/studio/api/billing/verify, called synchronously by the client right
// after checkout succeeds. This webhook is a logged-only safety net — if
// verify already processed the payment, applyTopup's txnId check makes it
// a no-op anyway, so there's no lookup-and-credit logic here to keep in
// sync with a GSI that doesn't exist. Always returns 200 to avoid Razorpay
// retry storms.
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-razorpay-signature') ?? ''

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? ''
  const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex')

  if (expectedSignature !== signature) {
    console.error('[razorpay-studio webhook] signature mismatch')
    return NextResponse.json({ received: true })
  }

  try {
    const event = JSON.parse(rawBody) as { event: string; payload?: { payment?: { entity?: { order_id?: string } } } }
    if (event.event === 'payment.captured') {
      console.info('[razorpay-studio webhook] payment.captured for order:', event.payload?.payment?.entity?.order_id)
    }
  } catch {
    // ignore parse errors — nothing to act on
  }

  return NextResponse.json({ received: true })
}
