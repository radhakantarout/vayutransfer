import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { WALLET_TOPUP_TIERS } from '@/constants/pricing'
import { creditWallet, getWalletBalance } from '@/lib/wallet'
import { formatPaise } from '@/lib/pricing'
import { logAudit } from '@/lib/audit'
import type { ApiResponse } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      razorpayPaymentId?: string
      razorpayOrderId?: string
      razorpaySignature?: string
      walletId?: string
      tierId?: string
      txnId?: string
    }

    const { razorpayPaymentId, razorpayOrderId, razorpaySignature, walletId, tierId, txnId } = body

    if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature || !walletId || !tierId || !txnId) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'MISSING_PARAMS', message: 'All payment fields are required' },
        { status: 400 }
      )
    }

    // Verify HMAC SHA256 signature
    const secret = process.env.RAZORPAY_KEY_SECRET ?? ''
    const payload = `${razorpayOrderId}|${razorpayPaymentId}`
    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex')

    if (expectedSignature !== razorpaySignature) {
      void logAudit({
        eventType: 'WEBHOOK_REJECTED',
        actor: 'razorpay',
        outcome: 'failure',
        walletId,
        txnId,
        errorCode: 'SIGNATURE_MISMATCH',
        metadata: { razorpayOrderId, razorpayPaymentId },
      })
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'SIGNATURE_INVALID', message: 'Payment verification failed' },
        { status: 400 }
      )
    }

    void logAudit({
      eventType: 'WEBHOOK_VERIFIED',
      actor: 'razorpay',
      outcome: 'success',
      walletId,
      txnId,
      metadata: { razorpayOrderId, razorpayPaymentId },
    })

    const tier = WALLET_TOPUP_TIERS.find((t) => t.id === tierId)
    if (!tier) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'INVALID_TIER', message: 'Unknown tier' },
        { status: 400 }
      )
    }

    await creditWallet(walletId, tier.pricePaise, tier.bonusPaise, txnId)

    const newBalancePaise = await getWalletBalance(walletId)

    return NextResponse.json<ApiResponse<{
      newBalancePaise: number
      newBalanceFormatted: string
    }>>({
      success: true,
      data: {
        newBalancePaise,
        newBalanceFormatted: formatPaise(newBalancePaise),
      },
    })
  } catch (err) {
    console.error('[wallet/verify]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Payment verification failed' },
      { status: 500 }
    )
  }
}
