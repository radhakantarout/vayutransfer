import { NextRequest, NextResponse } from 'next/server'
import { getItem, updateItem } from '@/lib/aws/dynamodb'
import { completeUpload } from '@/lib/aws/storage'
import { getTransferFiles, transferFileKey, updateTransferFileStatus } from '@/lib/transferBatch'
import { sendFileReceivedEmail } from '@/lib/aws/ses'
import { logAudit } from '@/lib/audit'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import type { ApiResponse, ReceiveRequest, Transfer, TransferFile } from '@/types'

const RECEIVE_REQUESTS_TABLE = process.env.DYNAMO_RECEIVE_REQUESTS_TABLE ?? 'vayu-receive-requests'
const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
const TRANSFER_FILES_TABLE = process.env.DYNAMO_TRANSFER_FILES_TABLE ?? 'vayu-transfer-files'

interface CompletedPart {
  PartNumber: number
  ETag: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: { requestId: string } }
) {
  try {
    const { requestId } = params
    const body = await req.json() as { fileId?: string; uploadId?: string; parts?: CompletedPart[] }
    const { fileId, uploadId, parts } = body
    if (!fileId || !uploadId || !parts?.length) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'MISSING_PARAMS', message: 'fileId, uploadId, parts are required' },
        { status: 400 }
      )
    }

    const receiveRequest = await getItem<ReceiveRequest>(RECEIVE_REQUESTS_TABLE, { requestId })
    if (!receiveRequest?.resultFileId || receiveRequest.status !== 'uploading') {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'UNAUTHORIZED', message: 'No upload in progress for this receive link' },
        { status: 403 }
      )
    }
    const batchId = receiveRequest.resultFileId

    const transferFile = await getItem<TransferFile>(TRANSFER_FILES_TABLE, { batchId, fileId })
    if (!transferFile) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'FILE_NOT_FOUND', message: 'File not found in this upload' },
        { status: 404 }
      )
    }

    await completeUpload(transferFile.storageBackend, transferFileKey(transferFile), uploadId, parts)
    await updateTransferFileStatus(batchId, fileId, 'uploaded')

    const transfer = await getItem<Transfer>(TRANSFERS_TABLE, { fileId: batchId })
    if (!transfer) throw new Error('Transfer not found for this batch')

    const allFiles = await getTransferFiles(transfer)
    const allUploaded = allFiles.every((f) => (f.fileId === fileId ? true : f.status === 'uploaded'))

    let justFulfilled = false
    if (allUploaded) {
      try {
        await updateItem(
          TRANSFERS_TABLE,
          { fileId: batchId },
          'SET #status = :active, completedAt = :now',
          { ':active': 'active', ':now': new Date().toISOString(), ':pending': 'pending' },
          '#status = :pending',
          { '#status': 'status' }
        )
        justFulfilled = true
      } catch (err) {
        if (!(err instanceof ConditionalCheckFailedException)) throw err
      }
    }

    if (justFulfilled) {
      await updateItem(
        RECEIVE_REQUESTS_TABLE,
        { requestId },
        'SET #s = :fulfilled, fulfilledAt = :now',
        { ':fulfilled': 'fulfilled', ':now': new Date().toISOString() },
        undefined,
        { '#s': 'status' }
      )

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
      sendFileReceivedEmail(receiveRequest.requesterEmail, transfer.fileName, transfer.fileCount ?? 1, `${appUrl}/download/${batchId}`)
        .catch((e) => console.error('[ses] file received email failed', e))

      void logAudit({
        eventType: 'RECEIVE_UPLOAD_COMPLETED',
        actor: 'user',
        outcome: 'success',
        walletId: receiveRequest.walletId,
        fileId: batchId,
        amountPaise: transfer.amountDeducted,
        metadata: { requestId, fileCount: transfer.fileCount, fileSizeBytes: transfer.fileSizeBytes },
      })
    }

    return NextResponse.json<ApiResponse<{ fileId: string; batchComplete: boolean }>>({
      success: true,
      data: { fileId, batchComplete: allUploaded },
    })
  } catch (err) {
    console.error('[receive/complete]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to complete file upload' },
      { status: 500 }
    )
  }
}
