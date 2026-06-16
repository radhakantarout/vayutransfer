import { NextRequest, NextResponse } from 'next/server'
import { updateItem } from '@/lib/aws/dynamodb'

// Dev-only endpoint — seeds wallet with ₹500. Does nothing in production.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ success: false, error: 'NOT_AVAILABLE' }, { status: 404 })
  }

  const { walletId } = await req.json() as { walletId: string }
  if (!walletId) {
    return NextResponse.json({ success: false, error: 'MISSING_WALLET_ID' }, { status: 400 })
  }

  const table = process.env.DYNAMO_WALLETS_TABLE ?? 'vayu-wallets'
  await updateItem(
    table,
    { walletId },
    'SET balance = balance + :amt, totalLoaded = totalLoaded + :amt, updatedAt = :now',
    { ':amt': 50000, ':now': new Date().toISOString() }
  )

  return NextResponse.json({ success: true, addedPaise: 50000, message: '₹500 added' })
}
