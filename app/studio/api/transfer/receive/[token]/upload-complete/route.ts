import { NextRequest, NextResponse } from 'next/server'
import { studioQueryByIndex, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { completeStudioR2MultipartUpload, abortStudioR2MultipartUpload } from '@/lib/studio/r2'
import type { StudioTransfer } from '@/types/studio'

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
    if (transfer.status !== 'UPLOADING' || !transfer.r2Key) {
      return NextResponse.json({ success: false, error: 'INVALID_STATE' }, { status: 400 })
    }

    const { uploadId, parts } = await req.json()
    if (!uploadId || !parts?.length) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    try {
      await completeStudioR2MultipartUpload(transfer.r2Key, uploadId, parts)
    } catch (err) {
      await abortStudioR2MultipartUpload(transfer.r2Key, uploadId).catch(() => {})
      throw err
    }

    const now = new Date().toISOString()
    await studioUpdateItem(
      TABLES.studios,
      { studioId: transfer.studioId },
      'ADD storageUsedBytes :size, billableStorageBytes :size SET updatedAt = :now',
      { ':size': transfer.sizeBytes, ':now': now }
    )
    await studioUpdateItem(
      TABLES.transfers,
      { projectId: transfer.projectId, transferId: transfer.transferId },
      'SET #s = :ready, updatedAt = :now',
      { ':ready': 'READY', ':now': now },
      { '#s': 'status' }
    )

    return NextResponse.json({ success: true, data: { status: 'READY' } })
  } catch (err) {
    console.error('[transfer receive upload-complete POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
