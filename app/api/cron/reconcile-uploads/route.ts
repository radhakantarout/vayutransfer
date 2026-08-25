import { NextRequest, NextResponse } from 'next/server'
import { scanAll, updateItem } from '@/lib/aws/dynamodb'
import { getTransferFiles, reconcilePartialBatch } from '@/lib/transferBatch'
import { refundWallet } from '@/lib/wallet'
import { logAudit } from '@/lib/audit'
import type { ApiResponse, Transfer } from '@/types'

const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
// Generous on purpose — files up to 400GB on a slow connection can
// legitimately take a long time. This is a safety net for genuinely
// abandoned uploads (refresh/close), not a timeout on slow-but-live ones.
const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000

// Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on every
// scheduled invocation as long as a project env var literally named
// CRON_SECRET is set — same pattern as VayuStudios' own crons
// (app/studio/api/cron/storage-check/route.ts). Query-param fallback is
// only for manually triggering this route yourself while testing.
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  const query = req.nextUrl.searchParams.get('secret')
  return auth === `Bearer ${secret}` || query === secret
}

// Safety net for uploads nobody ever comes back to finish (refresh, tab
// close, abandoned mid-upload with no explicit Cancel/Skip click) — those
// have nothing else that ever reconciles them; see the interrupted-upload
// plan. Batches get the exact same partial-refund treatment as the
// in-app "Skip failed files" button (reconcilePartialBatch); single-file
// transfers get a full refund since there's nothing to partially credit.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  try {
    const cutoff = Date.now() - STALE_THRESHOLD_MS
    const pending = await scanAll<Transfer>(
      TRANSFERS_TABLE,
      '#status = :pending',
      { ':pending': 'pending' },
      { '#status': 'status' }
    )
    const stale = pending.filter((t) => new Date(t.createdAt).getTime() < cutoff)

    let batchesReconciled = 0
    let singleFilesRefunded = 0
    let totalRefundedPaise = 0
    const errors: string[] = []

    for (const transfer of stale) {
      try {
        if (transfer.fileCount) {
          const files = await getTransferFiles(transfer)
          const stillPending = files.filter((f) => f.status === 'pending').map((f) => f.fileId)
          if (stillPending.length === 0) continue
          const { refundedPaise } = await reconcilePartialBatch(transfer, stillPending)
          batchesReconciled++
          totalRefundedPaise += refundedPaise
        } else {
          await updateItem(
            TRANSFERS_TABLE,
            { fileId: transfer.fileId },
            'SET #status = :failed',
            { ':failed': 'failed' },
            undefined,
            { '#status': 'status' }
          )
          await refundWallet(transfer.walletId, transfer.amountDeducted, transfer.fileId)
          void logAudit({
            eventType: 'UPLOAD_FAILED',
            actor: 'scheduler',
            outcome: 'failure',
            walletId: transfer.walletId,
            fileId: transfer.fileId,
            amountPaise: transfer.amountDeducted,
            metadata: { reason: 'STALE_PENDING_RECONCILED', refundedPaise: transfer.amountDeducted },
          })
          singleFilesRefunded++
          totalRefundedPaise += transfer.amountDeducted
        }
      } catch (err) {
        console.error('[cron/reconcile-uploads] failed for', transfer.fileId, err)
        errors.push(transfer.fileId)
      }
    }

    return NextResponse.json<ApiResponse<{
      scanned: number
      stale: number
      batchesReconciled: number
      singleFilesRefunded: number
      totalRefundedPaise: number
      errors: string[]
    }>>({
      success: true,
      data: { scanned: pending.length, stale: stale.length, batchesReconciled, singleFilesRefunded, totalRefundedPaise, errors },
    })
  } catch (err) {
    console.error('[cron/reconcile-uploads]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to reconcile stale uploads' },
      { status: 500 }
    )
  }
}
