import { NextRequest, NextResponse } from 'next/server'
import { queryItems } from '@/lib/aws/dynamodb'
import type { ApiResponse, Transaction } from '@/types'

export async function GET(req: NextRequest) {
  try {
    const walletId = req.nextUrl.searchParams.get('walletId')
    if (!walletId) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'MISSING_PARAMS', message: 'walletId is required' },
        { status: 400 }
      )
    }

    const table = process.env.DYNAMO_TRANSACTIONS_TABLE ?? 'vayu-transactions'
    const transactions = await queryItems<Transaction>(
      table,
      'walletId-index',
      'walletId = :w',
      { ':w': walletId }
    )

    // Sort by createdAt descending, return last 10
    const sorted = transactions
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .slice(0, 10)

    return NextResponse.json<ApiResponse<Transaction[]>>({
      success: true,
      data: sorted,
    })
  } catch (err) {
    console.error('[wallet/transactions]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to fetch transactions' },
      { status: 500 }
    )
  }
}
