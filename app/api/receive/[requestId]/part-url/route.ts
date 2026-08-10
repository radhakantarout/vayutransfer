import { NextRequest, NextResponse } from 'next/server'
import { getItem } from '@/lib/aws/dynamodb'
import { getPartPresignedUrl } from '@/lib/aws/storage'
import { transferFileKey } from '@/lib/transferBatch'
import type { ApiResponse, ReceiveRequest, TransferFile } from '@/types'

const RECEIVE_REQUESTS_TABLE = process.env.DYNAMO_RECEIVE_REQUESTS_TABLE ?? 'vayu-receive-requests'
const TRANSFER_FILES_TABLE = process.env.DYNAMO_TRANSFER_FILES_TABLE ?? 'vayu-transfer-files'

export async function POST(
  req: NextRequest,
  { params }: { params: { requestId: string } }
) {
  try {
    const { requestId } = params
    const body = await req.json() as { fileId?: string; uploadId?: string; partNumber?: number }
    const { fileId, uploadId, partNumber } = body
    if (!fileId || !uploadId || !partNumber) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'MISSING_PARAMS', message: 'fileId, uploadId, partNumber are required' },
        { status: 400 }
      )
    }
    if (partNumber < 1 || partNumber > 10000) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'INVALID_PART_NUMBER', message: 'Part number must be between 1 and 10000' },
        { status: 400 }
      )
    }

    // Ownership resolved via requestId -> resultFileId (batchId), never a
    // client-supplied walletId — the anonymous uploader has no wallet.
    const receiveRequest = await getItem<ReceiveRequest>(RECEIVE_REQUESTS_TABLE, { requestId })
    if (!receiveRequest?.resultFileId || receiveRequest.status !== 'uploading') {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'UNAUTHORIZED', message: 'No upload in progress for this receive link' },
        { status: 403 }
      )
    }

    const transferFile = await getItem<TransferFile>(TRANSFER_FILES_TABLE, { batchId: receiveRequest.resultFileId, fileId })
    if (!transferFile) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'FILE_NOT_FOUND', message: 'File not found in this upload' },
        { status: 404 }
      )
    }

    const presignedUrl = await getPartPresignedUrl(transferFile.storageBackend, transferFileKey(transferFile), uploadId, partNumber)

    return NextResponse.json<ApiResponse<{ presignedUrl: string; partNumber: number; expiresIn: number }>>({
      success: true,
      data: { presignedUrl, partNumber, expiresIn: 7200 },
    })
  } catch (err) {
    console.error('[receive/part-url]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to generate upload URL' },
      { status: 500 }
    )
  }
}
