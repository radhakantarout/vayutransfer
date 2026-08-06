import { NextRequest, NextResponse } from 'next/server'
import { getItem } from '@/lib/aws/dynamodb'
import { listUploadedParts, getAllPartPresignedUrls } from '@/lib/aws/storage'
import { transferFileKey } from '@/lib/transferBatch'
import type { ApiResponse, Transfer, TransferFile } from '@/types'

const TRANSFER_FILES_TABLE = process.env.DYNAMO_TRANSFER_FILES_TABLE ?? 'vayu-transfer-files'

// Same resume contract as the single-file upload-status route, scoped to
// one file within a batch — batchId/fileId identify the TransferFile row.
export async function GET(req: NextRequest) {
  try {
    const batchId   = req.nextUrl.searchParams.get('batchId')
    const fileId    = req.nextUrl.searchParams.get('fileId')
    const uploadId  = req.nextUrl.searchParams.get('uploadId')
    const partCount = parseInt(req.nextUrl.searchParams.get('partCount') ?? '', 10)
    const walletId  = req.nextUrl.searchParams.get('walletId')
    if (!batchId || !fileId || !uploadId || !partCount || partCount < 1 || !walletId) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'INVALID_INPUT', message: 'batchId, fileId, uploadId, partCount, walletId are required' },
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

    const transferFile = await getItem<TransferFile>(TRANSFER_FILES_TABLE, { batchId, fileId })
    if (!transferFile) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'FILE_NOT_FOUND', message: 'File not found in this batch' },
        { status: 404 }
      )
    }

    const key = transferFileKey(transferFile)
    const [completedParts, presignedUrls] = await Promise.all([
      listUploadedParts(transferFile.storageBackend, key, uploadId),
      getAllPartPresignedUrls(transferFile.storageBackend, key, uploadId, partCount),
    ])

    if (completedParts === null) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'UPLOAD_EXPIRED', message: 'This upload can no longer be resumed' },
        { status: 410 }
      )
    }

    return NextResponse.json<ApiResponse<{
      completedParts: { PartNumber: number; ETag: string }[]
      presignedUrls: string[]
    }>>({
      success: true,
      data: { completedParts, presignedUrls },
    })
  } catch (err) {
    console.error('[upload/batch/upload-status GET]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to check upload status' },
      { status: 500 }
    )
  }
}
