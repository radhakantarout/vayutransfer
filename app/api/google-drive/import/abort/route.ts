import { NextRequest, NextResponse } from 'next/server'
import { getItem, updateItem } from '@/lib/aws/dynamodb'
import { getTransferFiles, updateTransferFileStatus } from '@/lib/transferBatch'
import { refundWallet } from '@/lib/wallet'
import { formatPaise } from '@/lib/pricing'
import { logAudit } from '@/lib/audit'
import type { ApiResponse, Transfer } from '@/types'

// Mirrors app/api/upload/batch/abort/route.ts's semantics exactly (whole-
// batch, all-or-nothing refund, guarded by status==='pending' so a second
// call — or a stray file-complete callback that races this one — can't
// double-refund). The one difference: there's no client-driven multipart
// upload to actually abort on R2, since the Lambda writes directly — the
// Lambda itself isn't stopped (there's no cancellation channel to a
// fire-and-forget async invoke), it just keeps streaming and its eventual
// file-complete callbacks become no-ops once the Transfer is no longer
// 'pending' (finalizeBatchIfComplete's conditional write simply fails).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { batchId?: string; walletId?: string }
    const { batchId, walletId } = body
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
        { success: false, error: 'ALREADY_COMPLETED', message: 'Import is not in a cancellable state' },
        { status: 409 }
      )
    }

    const files = await getTransferFiles(transfer)
    await Promise.all(
      files
        .filter((f) => f.status === 'pending')
        .map((f) => updateTransferFileStatus(f.batchId, f.fileId, 'failed'))
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
      eventType: 'DRIVE_IMPORT_FAILED',
      actor: 'user',
      outcome: 'failure',
      walletId,
      fileId: batchId,
      amountPaise: transfer.amountDeducted,
      metadata: { reason: 'USER_ABANDONED', refundedPaise: transfer.amountDeducted, fileCount: transfer.fileCount },
    })

    return NextResponse.json<ApiResponse<{ refundedPaise: number; refundedFormatted: string }>>({
      success: true,
      data: { refundedPaise: transfer.amountDeducted, refundedFormatted: formatPaise(transfer.amountDeducted) },
    })
  } catch (err) {
    console.error('[google-drive/import/abort]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to cancel the import' },
      { status: 500 }
    )
  }
}
