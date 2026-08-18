import { NextRequest, NextResponse } from 'next/server'
import { getItem } from '@/lib/aws/dynamodb'
import { abortUpload } from '@/lib/aws/storage'
import { getTransferFiles, transferFileKey, finalizePartialBatch } from '@/lib/transferBatch'
import { formatPaise } from '@/lib/pricing'
import { logAudit } from '@/lib/audit'
import type { ApiResponse, Transfer } from '@/types'

// Called once the sender has given up retrying one or more still-failed
// files in a batch and chooses to proceed without them — "Skip" in the
// upload progress UI. Only ever offered client-side once every other file
// in the batch is already terminal (uploaded or genuinely failed after
// exhausting retries), so this never races an in-flight upload.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      batchId?: string
      walletId?: string
      skipFileIds?: string[]
    }

    const { batchId, walletId, skipFileIds } = body
    if (!batchId || !walletId || !skipFileIds || skipFileIds.length === 0) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'MISSING_PARAMS', message: 'batchId, walletId, skipFileIds are required' },
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

    // Clean up any lingering incomplete multipart upload on the storage side
    // for each file being skipped — best-effort, doesn't block the refund.
    const files = await getTransferFiles(transfer)
    await Promise.all(
      files
        .filter((f) => skipFileIds.includes(f.fileId) && f.uploadId)
        .map((f) =>
          abortUpload(f.storageBackend, transferFileKey(f), f.uploadId!)
            .catch((err) => console.error('[upload/batch/finalize-partial] failed to abort part-upload for', f.fileId, err))
        )
    )

    const { batchComplete, refundedPaise } = await finalizePartialBatch({ batchId, walletId, skipFileIds })

    void logAudit({
      eventType: 'UPLOAD_COMPLETED',
      actor: 'user',
      outcome: refundedPaise > 0 ? 'warning' : 'success',
      walletId,
      fileId: batchId,
      amountPaise: -refundedPaise,
      metadata: {
        skippedFileIds: skipFileIds,
        refundedPaise,
        batchComplete,
      },
    })

    return NextResponse.json<ApiResponse<{
      batchComplete: boolean
      refundedPaise: number
      refundedFormatted: string
    }>>({
      success: true,
      data: { batchComplete, refundedPaise, refundedFormatted: formatPaise(refundedPaise) },
    })
  } catch (err) {
    console.error('[upload/batch/finalize-partial]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to finalize the batch' },
      { status: 500 }
    )
  }
}
