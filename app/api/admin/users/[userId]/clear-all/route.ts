import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminJWT } from '@/lib/adminAuth'
import { queryItems } from '@/lib/aws/dynamodb'
import { deleteTransferAndStorage, deleteReceiveRequestAndCascade } from '@/lib/adminDelete'
import { getUserById } from '@/lib/users'
import { logAudit } from '@/lib/audit'
import type { ApiResponse, Transfer, ReceiveRequest } from '@/types'

const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
const RECEIVE_REQUESTS_TABLE = process.env.DYNAMO_RECEIVE_REQUESTS_TABLE ?? 'vayu-receive-requests'

// Bulk "Clear Memory" — deletes every non-deleted transfer and cancels
// every non-cancelled receive request for one user, in one action. Calls
// the exact same per-item logic the individual delete routes use (see
// lib/adminDelete.ts), just looped — no separate deletion logic to keep in
// sync. No refund, best-effort (one failure doesn't block the rest).
export async function POST(
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

    const transfersToDelete = transfers.filter((t) => t.status !== 'deleted')
    const requestsToDelete = receiveRequests.filter((r) => r.status !== 'cancelled')

    let transfersDeleted = 0
    let requestsCleared = 0
    const errors: string[] = []

    await Promise.all(transfersToDelete.map(async (t) => {
      try {
        await deleteTransferAndStorage(t)
        transfersDeleted++
      } catch (err) {
        console.error('[admin/clear-all] failed to delete transfer', t.fileId, err)
        errors.push(t.fileId)
      }
    }))

    // Sequential, not parallel — a fulfilled request's cascade delete reads
    // then writes the same Transfer a plain transfer-delete above might
    // also be touching; keeping this loop simple avoids racing the two.
    for (const r of requestsToDelete) {
      try {
        await deleteReceiveRequestAndCascade(r)
        requestsCleared++
      } catch (err) {
        console.error('[admin/clear-all] failed to clear request', r.requestId, err)
        errors.push(r.requestId)
      }
    }

    void logAudit({
      eventType: 'TRANSFER_DELETED',
      actor: 'admin',
      outcome: errors.length > 0 ? 'warning' : 'success',
      walletId: user.walletId,
      metadata: { adminAction: true, reason: 'ADMIN_CLEAR_ALL', transfersDeleted, requestsCleared, errors },
    })

    return NextResponse.json<ApiResponse<{ transfersDeleted: number; requestsCleared: number; errors: string[] }>>({
      success: true,
      data: { transfersDeleted, requestsCleared, errors },
    })
  } catch (err) {
    console.error('[admin/clear-all]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to clear this user\'s data' },
      { status: 500 }
    )
  }
}
