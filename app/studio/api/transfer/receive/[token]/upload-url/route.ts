import { NextRequest, NextResponse } from 'next/server'
import { studioQueryByIndex, studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { initiateStudioR2MultipartUpload, getStudioR2PartPresignedUrls, getStudioR2TransferKey } from '@/lib/studio/r2'
import { syncBillingCycle, checkStorageAvailable } from '@/lib/studio/quota'
import type { StudioTransfer, Studio } from '@/types/studio'

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

    // The uploader here is anonymous (no JWT) — gate against the *studio's*
    // quota, not theirs. A studio that's out of storage shouldn't be able
    // to accept a RECEIVE upload just because the sender isn't logged in.
    let studio = await studioGetItem<Studio>(TABLES.studios, { studioId: transfer.studioId })
    if (studio) {
      studio = await syncBillingCycle(studio)
      const quota = checkStorageAvailable(studio, sizeBytes)
      if (!quota.ok) {
        return NextResponse.json({ success: false, error: 'QUOTA_EXCEEDED', message: 'This studio is out of storage space and can\'t accept this upload right now.' }, { status: 402 })
      }
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
