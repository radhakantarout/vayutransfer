import { NextRequest, NextResponse } from 'next/server'
import { getItem, updateItem } from '@/lib/aws/dynamodb'
import { resolveOwnWalletId } from '@/lib/walletAuth'
import { logAudit } from '@/lib/audit'
import type { ApiResponse, Transfer } from '@/types'

const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'

// Immediately invalidates an existing transfer's link by backdating its
// expiryTime — reuses the exact "link expired" path every download route
// already has (LINK_EXPIRED -> DownloadCard's "This download link has
// expired and is no longer available") rather than inventing new status
// values or messaging. Used when the uploader picks "Replace" on a
// same-name/same-size duplicate: the old link stops working immediately,
// the new upload becomes the only valid copy. Never touches the R2 object
// itself — same as ordinary time-based expiry, actual byte cleanup happens
// via the existing lifecycle rule, not an app-triggered delete.
export async function POST(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const walletId = await resolveOwnWalletId()
    if (!walletId) {
      return NextResponse.json<ApiResponse<never>>({ success: false, error: 'UNAUTHORIZED' }, { status: 401 })
    }

    const { fileId } = params
    const transfer = await getItem<Transfer>(TRANSFERS_TABLE, { fileId })
    if (!transfer) {
      return NextResponse.json<ApiResponse<never>>({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    if (transfer.walletId !== walletId) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'FORBIDDEN', message: 'This transfer does not belong to you' },
        { status: 403 }
      )
    }

    const now = new Date().toISOString()
    await updateItem(
      TRANSFERS_TABLE,
      { fileId },
      'SET expiryTime = :now, updatedAt = :now',
      { ':now': now }
    )

    void logAudit({
      eventType: 'LINK_EXPIRED',
      actor: 'user',
      outcome: 'success',
      walletId,
      fileId,
      metadata: { reason: 'REPLACED_BY_DUPLICATE_UPLOAD' },
    })

    return NextResponse.json<ApiResponse<{ invalidated: true }>>({ success: true, data: { invalidated: true } })
  } catch (err) {
    console.error('[transfers invalidate]', err)
    return NextResponse.json<ApiResponse<never>>({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
