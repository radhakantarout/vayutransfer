import { NextRequest, NextResponse } from 'next/server'
import { getItem } from '@/lib/aws/dynamodb'
import { getPartPresignedUrl } from '@/lib/aws/storage'
import { transferFileKey } from '@/lib/transferBatch'
import type { ApiResponse, Transfer, TransferFile } from '@/types'

const TRANSFER_FILES_TABLE = process.env.DYNAMO_TRANSFER_FILES_TABLE ?? 'vayu-transfer-files'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      batchId?: string
      fileId?: string
      uploadId?: string
      partNumber?: number
      walletId?: string
    }

    const { batchId, fileId, uploadId, partNumber, walletId } = body
    if (!batchId || !fileId || !uploadId || !partNumber || !walletId) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'MISSING_PARAMS', message: 'batchId, fileId, uploadId, partNumber, walletId are required' },
        { status: 400 }
      )
    }
    if (partNumber < 1 || partNumber > 10000) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'INVALID_PART_NUMBER', message: 'Part number must be between 1 and 10000' },
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

    const presignedUrl = await getPartPresignedUrl(transferFile.storageBackend, transferFileKey(transferFile), uploadId, partNumber)

    return NextResponse.json<ApiResponse<{
      presignedUrl: string
      partNumber: number
      expiresIn: number
    }>>({
      success: true,
      data: { presignedUrl, partNumber, expiresIn: 7200 },
    })
  } catch (err) {
    console.error('[upload/batch/part-url]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to generate upload URL' },
      { status: 500 }
    )
  }
}
