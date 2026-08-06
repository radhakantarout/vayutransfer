import { NextRequest, NextResponse } from 'next/server'
import { getItem, updateItem } from '@/lib/aws/dynamodb'
import { abortUpload } from '@/lib/aws/storage'
import { getTransferFiles, transferFileKey, updateTransferFileStatus } from '@/lib/transferBatch'
import { refundWallet } from '@/lib/wallet'
import { logAudit } from '@/lib/audit'
import type { ApiResponse, ReceiveRequest, Transfer } from '@/types'

const RECEIVE_REQUESTS_TABLE = process.env.DYNAMO_RECEIVE_REQUESTS_TABLE ?? 'vayu-receive-requests'
const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'

// Uploader-initiated cancel — refunds the requester in full and resets the
// link back to 'pending' so the same receive link can be tried again
// (e.g. after picking the wrong files), rather than being burned for good.
export async function POST(
  req: NextRequest,
  { params }: { params: { requestId: string } }
) {
  try {
    const { requestId } = params
    const receiveRequest = await getItem<ReceiveRequest>(RECEIVE_REQUESTS_TABLE, { requestId })
    if (!receiveRequest?.resultFileId || receiveRequest.status !== 'uploading') {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'UNAUTHORIZED', message: 'No upload in progress for this receive link' },
        { status: 403 }
      )
    }
    const batchId = receiveRequest.resultFileId

    const transfer = await getItem<Transfer>(TRANSFERS_TABLE, { fileId: batchId })
    if (!transfer || transfer.status !== 'pending') {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'ALREADY_COMPLETED', message: 'This upload is not in a cancellable state' },
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
            console.error('[receive/abort] failed to abort part-upload for', f.fileId, err)
          }
          await updateTransferFileStatus(f.batchId, f.fileId, 'failed')
        })
    )

    await updateItem(
      TRANSFERS_TABLE,
      { fileId: batchId },
      'SET #status = :failed',
      { ':failed': 'failed' },
      undefined,
      { '#status': 'status' }
    )
    await refundWallet(receiveRequest.walletId, transfer.amountDeducted, batchId)

    await updateItem(
      RECEIVE_REQUESTS_TABLE,
      { requestId },
      'SET #s = :pending REMOVE resultFileId',
      { ':pending': 'pending' },
      undefined,
      { '#s': 'status' }
    )

    void logAudit({
      eventType: 'UPLOAD_FAILED',
      actor: 'user',
      outcome: 'failure',
      walletId: receiveRequest.walletId,
      fileId: batchId,
      amountPaise: transfer.amountDeducted,
      metadata: { requestId, reason: 'RECEIVE_UPLOADER_CANCELLED', refundedPaise: transfer.amountDeducted },
    })

    return NextResponse.json<ApiResponse<{ refundedPaise: number }>>({
      success: true,
      data: { refundedPaise: transfer.amountDeducted },
    })
  } catch (err) {
    console.error('[receive/abort]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to cancel upload' },
      { status: 500 }
    )
  }
}
