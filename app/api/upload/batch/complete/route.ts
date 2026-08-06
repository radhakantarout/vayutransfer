import { NextRequest, NextResponse } from 'next/server'
import { getItem, updateItem } from '@/lib/aws/dynamodb'
import { completeUpload } from '@/lib/aws/storage'
import { getTransferFiles, transferFileKey, updateTransferFileStatus } from '@/lib/transferBatch'
import { sendTransferLinkEmail } from '@/lib/aws/ses'
import { logAudit } from '@/lib/audit'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import type { ApiResponse, Transfer, TransferFile } from '@/types'

const TRANSFER_FILES_TABLE = process.env.DYNAMO_TRANSFER_FILES_TABLE ?? 'vayu-transfer-files'

interface CompletedPart {
  PartNumber: number
  ETag: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      batchId?: string
      fileId?: string
      uploadId?: string
      parts?: CompletedPart[]
      walletId?: string
    }

    const { batchId, fileId, uploadId, parts, walletId } = body
    if (!batchId || !fileId || !uploadId || !parts?.length || !walletId) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'MISSING_PARAMS', message: 'batchId, fileId, uploadId, parts, walletId are required' },
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

    const transferFile = await getItem<TransferFile>(TRANSFER_FILES_TABLE, { batchId, fileId })
    if (!transferFile) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'FILE_NOT_FOUND', message: 'File not found in this batch' },
        { status: 404 }
      )
    }

    await completeUpload(transferFile.storageBackend, transferFileKey(transferFile), uploadId, parts)
    await updateTransferFileStatus(batchId, fileId, 'uploaded')

    // Whichever request observes every file uploaded flips the batch to
    // active — the conditional write ensures only one caller ever wins the
    // race and sends the recipient email, no matter how many files finish
    // in the same instant.
    const allFiles = await getTransferFiles(transfer)
    const allUploaded = allFiles.every((f) => f.fileId === fileId ? true : f.status === 'uploaded')

    let justActivated = false
    if (allUploaded) {
      try {
        await updateItem(
          transfersTable,
          { fileId: batchId },
          'SET #status = :active, completedAt = :now',
          { ':active': 'active', ':now': new Date().toISOString(), ':pending': 'pending' },
          '#status = :pending',
          { '#status': 'status' }
        )
        justActivated = true
      } catch (err) {
        if (!(err instanceof ConditionalCheckFailedException)) throw err
      }
    }

    if (justActivated) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
      const shareableLink = `${appUrl}/download/${batchId}`
      const recipients = transfer.recipientEmails ?? []
      for (const email of recipients) {
        sendTransferLinkEmail(email, transfer.fileName, shareableLink, transfer.expiryTime)
          .catch((err) => console.error('[ses] email send failed to', email, err))
      }

      void logAudit({
        eventType: 'UPLOAD_COMPLETED',
        actor: 'user',
        outcome: 'success',
        walletId,
        fileId: batchId,
        amountPaise: transfer.amountDeducted,
        metadata: {
          fileCount: transfer.fileCount,
          fileSizeBytes: transfer.fileSizeBytes,
          expiryTime: transfer.expiryTime,
          shareableLink,
          recipientEmailsSent: recipients.length,
        },
      })
    }

    return NextResponse.json<ApiResponse<{
      fileId: string
      batchComplete: boolean
    }>>({
      success: true,
      data: { fileId, batchComplete: allUploaded },
    })
  } catch (err) {
    console.error('[upload/batch/complete]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to complete file upload' },
      { status: 500 }
    )
  }
}
