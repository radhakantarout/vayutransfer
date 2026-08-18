import { NextRequest, NextResponse } from 'next/server'
import { getItem, updateItem } from '@/lib/aws/dynamodb'
import { completeUpload, transferKey } from '@/lib/aws/storage'
import { sendTransferLinkEmail } from '@/lib/aws/ses'
import { logAudit } from '@/lib/audit'
import type { ApiResponse, Transfer } from '@/types'

interface CompletedPart {
  PartNumber: number
  ETag: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      fileId?: string
      uploadId?: string
      s3Key?: string
      parts?: CompletedPart[]
      walletId?: string
    }

    const { fileId, uploadId, s3Key, parts, walletId } = body

    if (!fileId || !uploadId || !s3Key || !parts?.length || !walletId) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'MISSING_PARAMS', message: 'fileId, uploadId, s3Key, parts, walletId are required' },
        { status: 400 }
      )
    }

    const transfersTable = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
    const transfer = await getItem<Transfer>(transfersTable, { fileId })

    if (!transfer || transfer.walletId !== walletId) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'UNAUTHORIZED', message: 'Transfer not found or access denied' },
        { status: 403 }
      )
    }

    // Complete the multipart upload — uses the transfer record's own
    // authoritative key/backend, not the client-supplied s3Key.
    await completeUpload(transfer.storageBackend, transferKey(transfer), uploadId, parts)

    const now = new Date().toISOString()
    // expiryTime was already set at initiate time (createdAt + expiryDays)
    // — completion just activates the transfer, it doesn't move the clock.
    const expiryTime = transfer.expiryTime

    // Mark transfer as active
    await updateItem(
      transfersTable,
      { fileId },
      'SET #status = :active, completedAt = :now',
      { ':active': 'active', ':now': now },
      undefined,
      { '#status': 'status' }
    )

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const shareableLink = `${appUrl}/download/${fileId}`

    // Send email to all recipients
    const recipients = transfer.recipientEmails ?? []
    for (const email of recipients) {
      sendTransferLinkEmail(email, transfer.fileName, shareableLink, expiryTime, transfer.message)
        .catch((err) => console.error('[ses] email send failed to', email, err))
    }

    void logAudit({
      eventType: 'UPLOAD_COMPLETED',
      actor: 'user',
      outcome: 'success',
      walletId,
      fileId,
      amountPaise: transfer.amountDeducted,
      metadata: {
        fileName: transfer.fileName,
        fileSizeBytes: transfer.fileSizeBytes,
        expiryTime,
        shareableLink,
        recipientEmailsSent: transfer.recipientEmails?.length ?? 0,
      },
    })

    return NextResponse.json<ApiResponse<{
      shareableLink: string
      fileId: string
      expiryTime: string
    }>>({
      success: true,
      data: { shareableLink, fileId, expiryTime },
    })
  } catch (err) {
    console.error('[upload/complete]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to complete upload' },
      { status: 500 }
    )
  }
}
