import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { completeStudioR2MultipartUpload, abortStudioR2MultipartUpload } from '@/lib/studio/r2'
import type { StudioTransfer } from '@/types/studio'

// SEND direction only — completes the studio owner's own upload. Deliberately
// never invokes the watermark Lambda: raw transfers are never watermarked,
// full stop, so that guarantee is structural (this code path just doesn't
// exist here) rather than a flag that could be forgotten.
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string; transferId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId, transferId } = params
    const { uploadId, parts } = await req.json()
    if (!uploadId || !parts?.length) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    const transfer = await studioGetItem<StudioTransfer>(TABLES.transfers, { projectId, transferId })
    if (!transfer || transfer.studioId !== auth.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    if (transfer.direction !== 'SEND') {
      return NextResponse.json({ success: false, error: 'INVALID_STATE', message: 'Not a SEND transfer' }, { status: 400 })
    }
    if (!transfer.r2Key) {
      return NextResponse.json({ success: false, error: 'INVALID_STATE', message: 'Missing r2Key' }, { status: 500 })
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
      { projectId, transferId },
      'SET #s = :ready, updatedAt = :now',
      { ':ready': 'READY', ':now': now },
      { '#s': 'status' }
    )

    return NextResponse.json({ success: true, data: { status: 'READY' } })
  } catch (err) {
    console.error('[transfers upload-complete POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
