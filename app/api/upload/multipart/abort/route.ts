import { NextRequest, NextResponse } from 'next/server'
import { getItem, updateItem } from '@/lib/aws/dynamodb'
import { abortMultipartUpload } from '@/lib/aws/s3'
import { refundWallet } from '@/lib/wallet'
import { formatPaise } from '@/lib/pricing'
import { logAudit } from '@/lib/audit'
import type { ApiResponse, Transfer } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      fileId?: string
      uploadId?: string
      s3Key?: string
      walletId?: string
      reason?: string
    }

    const { fileId, uploadId, s3Key, walletId, reason } = body

    if (!fileId || !uploadId || !s3Key || !walletId) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'MISSING_PARAMS', message: 'fileId, uploadId, s3Key, walletId are required' },
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

    if (transfer.status !== 'pending') {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'ALREADY_COMPLETED', message: 'Transfer is not in pending state' },
        { status: 409 }
      )
    }

    // Abort S3 multipart upload
    await abortMultipartUpload(s3Key, uploadId)

    // Mark transfer as failed
    await updateItem(
      transfersTable,
      { fileId },
      'SET #status = :failed',
      { ':failed': 'failed' },
      undefined,
      { '#status': 'status' }
    )

    // Refund wallet
    await refundWallet(walletId, transfer.amountDeducted, fileId)

    void logAudit({
      eventType: 'UPLOAD_FAILED',
      actor: 'user',
      outcome: 'failure',
      walletId,
      fileId,
      amountPaise: transfer.amountDeducted,
      metadata: {
        reason: reason ?? 'USER_ABANDONED',
        refundedPaise: transfer.amountDeducted,
        fileId,
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
    console.error('[upload/abort]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to abort upload' },
      { status: 500 }
    )
  }
}
