import { NextRequest, NextResponse } from 'next/server'
import { studioQueryByIndex, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { initiateStudioR2MultipartUpload, getStudioR2PartPresignedUrls, getStudioR2TransferKey } from '@/lib/studio/r2'
import type { StudioTransfer } from '@/types/studio'

// Fully anonymous, no JWT — lets whoever the studio owner shared this link
// with upload a file back, with no VayuStudios login at all.
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params
    const transfers = await studioQueryByIndex<StudioTransfer>(
      TABLES.transfers, 'shareToken-index', 'shareToken = :token', { ':token': token }
    )
    const transfer = transfers[0]
    if (!transfer || transfer.direction !== 'RECEIVE') {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    if (new Date(transfer.shareExpiresAt) < new Date()) {
      return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
    }
    if (transfer.status !== 'PENDING') {
      return NextResponse.json({ success: false, error: 'NOT_ACCEPTING_UPLOADS' }, { status: 400 })
    }

    const { filename, mimeType, sizeBytes, partCount } = await req.json()
    if (!filename || !mimeType || !sizeBytes || !partCount) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }
    if (partCount < 1 || partCount > 10000) {
      return NextResponse.json({ success: false, error: 'INVALID_PART_COUNT' }, { status: 400 })
    }

    const r2Key = getStudioR2TransferKey(transfer.studioId, transfer.projectId, transfer.transferId, filename)
    const uploadId = await initiateStudioR2MultipartUpload(r2Key, mimeType)
    const presignedUrls = await getStudioR2PartPresignedUrls(r2Key, uploadId, partCount)

    const now = new Date().toISOString()
    await studioUpdateItem(
      TABLES.transfers,
      { projectId: transfer.projectId, transferId: transfer.transferId },
      'SET #s = :uploading, filename = :fn, mimeType = :mt, sizeBytes = :sz, r2Key = :key, updatedAt = :now',
      { ':uploading': 'UPLOADING', ':fn': filename, ':mt': mimeType, ':sz': sizeBytes, ':key': r2Key, ':now': now },
      { '#s': 'status' }
    )

    return NextResponse.json({ success: true, data: { transferId: transfer.transferId, uploadId, presignedUrls } })
  } catch (err) {
    console.error('[transfer receive upload-url POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
