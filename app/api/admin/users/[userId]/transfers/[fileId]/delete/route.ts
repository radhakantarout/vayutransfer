import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminJWT } from '@/lib/adminAuth'
import { getItem } from '@/lib/aws/dynamodb'
import { deleteTransferAndStorage } from '@/lib/adminDelete'
import { getUserById } from '@/lib/users'
import { logAudit } from '@/lib/audit'
import type { ApiResponse, Transfer } from '@/types'

const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'

// Admin force-delete — same underlying storage-delete logic as the
// user-facing DELETE /api/transfers/[fileId], just gated by admin auth
// instead of wallet ownership, and audited with actor: 'admin'. No refund,
// same as the user-facing path.
export async function POST(
  req: NextRequest,
  { params }: { params: { userId: string; fileId: string } }
) {
  const auth = await verifyAdminJWT(req)
  if (!auth) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  try {
    const { userId, fileId } = params
    const transfer = await getItem<Transfer>(TRANSFERS_TABLE, { fileId })
    if (!transfer) {
      return NextResponse.json<ApiResponse<never>>({ success: false, error: 'NOT_FOUND', message: 'Transfer not found' }, { status: 404 })
    }
    // The URL's userId is more than cosmetic — verify this transfer
    // actually belongs to the user this admin session is looking at, so a
    // crafted/mismatched URL can't be used to delete an unrelated user's
    // transfer via a page that only ever shows same-user pairs.
    const targetUser = await getUserById(userId)
    if (!targetUser || transfer.walletId !== targetUser.walletId) {
      return NextResponse.json<ApiResponse<never>>({ success: false, error: 'NOT_FOUND', message: 'Transfer does not belong to this user' }, { status: 404 })
    }
    if (transfer.status === 'deleted') {
      return NextResponse.json<ApiResponse<never>>({ success: false, error: 'ALREADY_DELETED', message: 'This transfer was already deleted' }, { status: 409 })
    }

    await deleteTransferAndStorage(transfer)

    void logAudit({
      eventType: 'TRANSFER_DELETED',
      actor: 'admin',
      outcome: 'success',
      walletId: transfer.walletId,
      fileId,
      metadata: { fileCount: transfer.fileCount, fileSizeBytes: transfer.fileSizeBytes, adminAction: true },
    })

    return NextResponse.json<ApiResponse<{ ok: true }>>({ success: true, data: { ok: true } })
  } catch (err) {
    console.error('[admin/transfers/delete]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to delete transfer' },
      { status: 500 }
    )
  }
}
