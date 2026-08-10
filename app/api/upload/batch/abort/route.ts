import { NextRequest, NextResponse } from 'next/server'
import { getItem, updateItem } from '@/lib/aws/dynamodb'
import { abortUpload } from '@/lib/aws/storage'
import { getTransferFiles, transferFileKey, updateTransferFileStatus } from '@/lib/transferBatch'
import { refundWallet } from '@/lib/wallet'
import { formatPaise } from '@/lib/pricing'
import { logAudit } from '@/lib/audit'
import type { ApiResponse, Transfer } from '@/types'

// Aborts an entire batch — the wallet was deducted once for the whole
// selection, so cancellation is all-or-nothing too, mirroring the
// single-file abort route's semantics.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      batchId?: string
      walletId?: string
      reason?: string
    }

    const { batchId, walletId, reason } = body
    if (!batchId || !walletId) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'MISSING_PARAMS', message: 'batchId, walletId are required' },
        { status: 400 }
      )
    }

    const transfersTable = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
    const transfer = await getItem<Transfer>(transfersTable, { fileId: batchId })
    if (!transfer || transfer.walletId !== walletId) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'UNAUTHORIZED', message: 'Transfer not found or access denied' },
        { status: 403 }
      )
    }
    if (transfer.status !== 'pending') {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'ALREADY_COMPLETED', message: 'Transfer is not in pending state' },
        { status: 409 }
      )
    }

    const files = await getTransferFiles(transfer)
    await Promise.all(
      files
        .filter((f) => f.status === 'pending' && f.uploadId)
        .map(async (f) => {
          try {
            await abortUpload(f.storageBackend, transferFileKey(f), f.uploadId!)
          } catch (err) {
            console.error('[upload/batch/abort] failed to abort part-upload for', f.fileId, err)
          }
          await updateTransferFileStatus(f.batchId, f.fileId, 'failed')
        })
    )

    await updateItem(
      transfersTable,
      { fileId: batchId },
      'SET #status = :failed',
      { ':failed': 'failed' },
      undefined,
      { '#status': 'status' }
    )

    await refundWallet(walletId, transfer.amountDeducted, batchId)

    void logAudit({
      eventType: 'UPLOAD_FAILED',
      actor: 'user',
      outcome: 'failure',
      walletId,
      fileId: batchId,
      amountPaise: transfer.amountDeducted,
      metadata: {
        reason: reason ?? 'USER_ABANDONED',
        refundedPaise: transfer.amountDeducted,
        fileCount: transfer.fileCount,
      },
    })

    return NextResponse.json<ApiResponse<{
      refundedPaise: number
      refundedFormatted: string
    }>>({
      success: true,
      data: {
        refundedPaise: transfer.amountDeducted,
        refundedFormatted: formatPaise(transfer.amountDeducted),
      },
    })
  } catch (err) {
    console.error('[upload/batch/abort]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to abort batch upload' },
      { status: 500 }
    )
  }
}
