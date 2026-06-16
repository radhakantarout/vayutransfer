import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { v4 as uuidv4 } from 'uuid'
import { WALLET_TOPUP_TIERS } from '@/constants/pricing'
import { putItem } from '@/lib/aws/dynamodb'
import { logAudit } from '@/lib/audit'
import type { ApiResponse, Transaction } from '@/types'

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID ?? '',
  key_secret: process.env.RAZORPAY_KEY_SECRET ?? '',
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { tierId?: string; walletId?: string }
    const { tierId, walletId } = body

    if (!tierId || !walletId) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'MISSING_PARAMS', message: 'tierId and walletId are required' },
        { status: 400 }
      )
    }

    const tier = WALLET_TOPUP_TIERS.find((t) => t.id === tierId)
    if (!tier) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'INVALID_TIER', message: 'Unknown top-up tier' },
        { status: 400 }
      )
    }

    const order = await razorpay.orders.create({
      amount: tier.pricePaise,
      currency: 'INR',
      receipt: uuidv4().slice(0, 40),
    })

    const txnId = uuidv4()
    const pendingTxn: Transaction = {
      txnId,
      walletId,
      type: 'topup',
      amount: tier.pricePaise,
      bonusAmount: tier.bonusPaise,
      razorpayOrderId: order.id,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }

    const txnTable = process.env.DYNAMO_TRANSACTIONS_TABLE ?? 'vayu-transactions'
    await putItem(txnTable, pendingTxn)

    void logAudit({
      eventType: 'WALLET_TOPUP_INITIATED',
      actor: 'user',
      outcome: 'success',
      walletId,
      txnId,
      amountPaise: tier.pricePaise,
      metadata: {
        tierId,
        bonusPaise: tier.bonusPaise,
        razorpayOrderId: order.id,
      },
    })

    return NextResponse.json<ApiResponse<{
      orderId: string
      amountPaise: number
      currency: string
      keyId: string
      txnId: string
    }>>({
      success: true,
      data: {
        orderId: order.id,
        amountPaise: tier.pricePaise,
        currency: 'INR',
        keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? '',
        txnId,
      },
    })
  } catch (err) {
    console.error('[wallet/topup]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to create payment order' },
      { status: 500 }
    )
  }
}
