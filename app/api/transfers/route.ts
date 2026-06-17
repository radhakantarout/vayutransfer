import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getUserById } from '@/lib/users'
import { queryItems } from '@/lib/aws/dynamodb'
import type { ApiResponse, Transfer } from '@/types'

const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'UNAUTHORIZED', message: 'Sign in to view transfer history' },
        { status: 401 }
      )
    }

    const user = await getUserById(session.user.id)
    if (!user) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404 }
      )
    }

    const transfers = await queryItems<Transfer>(
      TRANSFERS_TABLE,
      'walletId-index',
      'walletId = :w',
      { ':w': user.walletId }
    )

    // Sort newest first
    transfers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return NextResponse.json<ApiResponse<Transfer[]>>({ success: true, data: transfers })
  } catch (err) {
    console.error('[transfers]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to fetch transfers' },
      { status: 500 }
    )
  }
}
