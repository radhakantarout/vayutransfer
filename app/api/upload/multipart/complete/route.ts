import { NextRequest, NextResponse } from 'next/server'
import { getItem, updateItem } from '@/lib/aws/dynamodb'
import { completeMultipartUpload } from '@/lib/aws/s3'
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

    // Complete the S3 multipart upload
    await completeMultipartUpload(s3Key, uploadId, parts)

    const now = new Date().toISOString()
    const expiryHours = parseInt(process.env.DEFAULT_EXPIRY_HOURS ?? '24', 10)
    const expiryTime = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString()

    // Mark transfer as active
    await updateItem(
      transfersTable,
      { fileId },
      'SET #status = :active, expiryTime = :expiry, completedAt = :now',
      { ':active': 'active', ':expiry': expiryTime, ':now': now },
      undefined,
      { '#status': 'status' }
    )

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const shareableLink = `${appUrl}/download/${fileId}`

    // Send email with the shareable page link (not a presigned URL — those expire in 15 min)
    if (transfer.recipientEmail) {
      sendTransferLinkEmail(
        transfer.recipientEmail,
        transfer.fileName,
        shareableLink,
        expiryTime,
        transfer.downloadSlots
      ).catch((err) => console.error('[ses] email send failed:', err))
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
        downloadSlots: transfer.downloadSlots,
        expiryTime,
        shareableLink,
        recipientEmailSent: !!transfer.recipientEmail,
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
