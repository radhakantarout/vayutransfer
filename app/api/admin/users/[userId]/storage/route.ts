import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminJWT } from '@/lib/adminAuth'
import { queryItems } from '@/lib/aws/dynamodb'
import { getUserById } from '@/lib/users'
import type { ApiResponse, Transfer, ReceiveRequest } from '@/types'

const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
const RECEIVE_REQUESTS_TABLE = process.env.DYNAMO_RECEIVE_REQUESTS_TABLE ?? 'vayu-receive-requests'

// Backing data for the dedicated "clear memory" page — every transfer and
// receive request this user has, uncapped (unlike the general profile
// page's 100-row cap) since exhaustive management is the whole point here.
export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const auth = await verifyAdminJWT(req)
  if (!auth) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  try {
    const { userId } = params
    const user = await getUserById(userId)
    if (!user) {
      return NextResponse.json<ApiResponse<never>>({ success: false, error: 'NOT_FOUND', message: 'User not found' }, { status: 404 })
    }

    const [transfers, receiveRequests] = await Promise.all([
      queryItems<Transfer>(TRANSFERS_TABLE, 'walletId-index', 'walletId = :w', { ':w': user.walletId }),
      queryItems<ReceiveRequest>(RECEIVE_REQUESTS_TABLE, 'walletId-index', 'walletId = :w', { ':w': user.walletId }),
    ])

    transfers.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    receiveRequests.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    return NextResponse.json<ApiResponse<{
      user: { userId: string; name: string; email: string }
      transfers: Transfer[]
      receiveRequests: ReceiveRequest[]
    }>>({
      success: true,
      data: {
        user: { userId: user.userId, name: user.name, email: user.email },
        transfers,
        receiveRequests,
      },
    })
  } catch (err) {
    console.error('[admin/users/storage]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to load storage details' },
      { status: 500 }
    )
  }
}
