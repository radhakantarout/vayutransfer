import { NextRequest, NextResponse } from 'next/server'
import { getItem } from '@/lib/aws/dynamodb'
import { completeUpload } from '@/lib/aws/storage'
import { transferFileKey, finalizeBatchIfComplete } from '@/lib/transferBatch'
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
    const { batchComplete } = await finalizeBatchIfComplete({ batchId, fileId, walletId })

    return NextResponse.json<ApiResponse<{
      fileId: string
      batchComplete: boolean
    }>>({
      success: true,
      data: { fileId, batchComplete },
    })
  } catch (err) {
    console.error('[upload/batch/complete]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to complete file upload' },
      { status: 500 }
    )
  }
}
