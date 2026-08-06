import { NextRequest, NextResponse } from 'next/server'
import { getItem } from '@/lib/aws/dynamodb'
import { listUploadedParts, getAllPartPresignedUrls, transferKey } from '@/lib/aws/storage'
import type { ApiResponse, Transfer } from '@/types'

// Lets the client resume an interrupted upload instead of restarting from
// scratch: returns which parts the backend actually has recorded for this
// uploadId (the server-side source of truth — never trust the client's
// local state blindly) plus freshly-signed URLs for every part, since
// presigned URLs expire long before a stalled upload might resume.
// Ownership is checked via walletId, matching the same trust model already
// used by part-url/complete/abort (no session required for uploads).
export async function GET(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const { fileId } = params
    const uploadId  = req.nextUrl.searchParams.get('uploadId')
    const partCount = parseInt(req.nextUrl.searchParams.get('partCount') ?? '', 10)
    const walletId  = req.nextUrl.searchParams.get('walletId')
    if (!uploadId || !partCount || partCount < 1 || !walletId) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'INVALID_INPUT', message: 'uploadId, partCount, walletId are required' },
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

    const key = transferKey(transfer)
    const [completedParts, presignedUrls] = await Promise.all([
      listUploadedParts(transfer.storageBackend, key, uploadId),
      getAllPartPresignedUrls(transfer.storageBackend, key, uploadId, partCount),
    ])

    if (completedParts === null) {
      // uploadId no longer exists on the backend (expired/aborted) — caller should start fresh
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
    console.error('[upload-status GET]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to check upload status' },
      { status: 500 }
    )
  }
}
