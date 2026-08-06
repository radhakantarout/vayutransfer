import { NextRequest, NextResponse } from 'next/server'
import { getItem } from '@/lib/aws/dynamodb'
import { getKeyPreviewPresignedUrl } from '@/lib/aws/storage'
import { getTransferFiles, transferFileKey } from '@/lib/transferBatch'
import type { ApiResponse, Transfer } from '@/types'

const PREVIEWABLE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif',
  'mp4', 'webm', 'mov', 'm4v',
  'mp3', 'wav', 'ogg', 'm4a',
  'pdf', 'txt',
])

function isPreviewable(fileName: string, contentType: string): boolean {
  if (contentType.startsWith('image/') || contentType.startsWith('video/') || contentType.startsWith('audio/') || contentType === 'application/pdf') {
    return true
  }
  const ext = fileName.split('.').pop()?.toLowerCase()
  return !!ext && PREVIEWABLE_EXTENSIONS.has(ext)
}

// Browser-native preview — deliberately does NOT touch downloadsUsed. The
// download slot pool is spent by the real Download button (POST /api/download/[fileId]),
// not by looking at a file inline first.
export async function GET(
  _req: NextRequest,
  { params }: { params: { fileId: string; targetFileId: string } }
) {
  const { fileId, targetFileId } = params
  const transfersTable = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
  const transfer = await getItem<Transfer>(transfersTable, { fileId })

  if (!transfer) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'FILE_NOT_FOUND', message: 'File not found' },
      { status: 404 }
    )
  }
  if (new Date() > new Date(transfer.expiryTime)) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'LINK_EXPIRED', message: 'This download link has expired' },
      { status: 410 }
    )
  }
  if (transfer.status !== 'active') {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'FILE_NOT_READY', message: 'File is not available' },
      { status: 404 }
    )
  }

  const files = await getTransferFiles(transfer)
  const file = files.find((f) => f.fileId === targetFileId && f.status !== 'failed')
  if (!file) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'FILE_NOT_FOUND', message: 'File not found in this transfer' },
      { status: 404 }
    )
  }
  if (!isPreviewable(file.fileName, file.contentType)) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'NOT_PREVIEWABLE', message: 'This file type cannot be previewed' },
      { status: 400 }
    )
  }

  const previewUrl = await getKeyPreviewPresignedUrl(file.storageBackend, transferFileKey(file), file.fileName)

  return NextResponse.json<ApiResponse<{ previewUrl: string; contentType: string }>>({
    success: true,
    data: { previewUrl, contentType: file.contentType },
  })
}
