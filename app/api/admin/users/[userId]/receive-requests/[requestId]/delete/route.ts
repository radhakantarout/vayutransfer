import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminJWT } from '@/lib/adminAuth'
import { getItem } from '@/lib/aws/dynamodb'
import { deleteReceiveRequestAndCascade } from '@/lib/adminDelete'
import { getUserById } from '@/lib/users'
import { logAudit } from '@/lib/audit'
import type { ApiResponse, ReceiveRequest } from '@/types'

const RECEIVE_REQUESTS_TABLE = process.env.DYNAMO_RECEIVE_REQUESTS_TABLE ?? 'vayu-receive-requests'

// Admin force-delete for a receive request. There's no user-facing
// equivalent of this today (requesters can't self-delete a request) — this
// exists purely for admin "clear memory"/data-deletion-request fulfillment.
// A fulfilled request's real storage-consuming asset is the batch Transfer
// it resulted in, not the request record itself, so deleting one cascades
// into deleting the other (see lib/adminDelete.ts). No refund.
export async function POST(
  req: NextRequest,
  { params }: { params: { userId: string; requestId: string } }
) {
  const auth = await verifyAdminJWT(req)
  if (!auth) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  try {
    const { userId, requestId } = params
    const request = await getItem<ReceiveRequest>(RECEIVE_REQUESTS_TABLE, { requestId })
    if (!request) {
      return NextResponse.json<ApiResponse<never>>({ success: false, error: 'NOT_FOUND', message: 'Receive request not found' }, { status: 404 })
    }

    const targetUser = await getUserById(userId)
    if (!targetUser || request.walletId !== targetUser.walletId) {
      return NextResponse.json<ApiResponse<never>>({ success: false, error: 'NOT_FOUND', message: 'Receive request does not belong to this user' }, { status: 404 })
    }
    if (request.status === 'cancelled') {
      return NextResponse.json<ApiResponse<never>>({ success: false, error: 'ALREADY_DELETED', message: 'This request was already cleared' }, { status: 409 })
    }

    const { deletedTransfer } = await deleteReceiveRequestAndCascade(request)

    void logAudit({
      eventType: 'RECEIVE_REQUEST_DELETED',
      actor: 'admin',
      outcome: 'success',
      walletId: request.walletId,
      fileId: request.resultFileId,
      metadata: { requestId, deletedTransfer, adminAction: true },
    })

    return NextResponse.json<ApiResponse<{ ok: true; deletedTransfer: boolean }>>({ success: true, data: { ok: true, deletedTransfer } })
  } catch (err) {
    console.error('[admin/receive-requests/delete]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to clear this request' },
      { status: 500 }
    )
  }
}
