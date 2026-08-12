import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { getStudioR2UploadedBytes } from '@/lib/studio/r2'
import { RECEIVE_PROGRESS_CHECK_COOLDOWN_MS } from '@/lib/studio/transferConfig'
import type { StudioTransfer } from '@/types/studio'

// On-demand, rate-limited progress check for a RECEIVE transfer that's
// currently UPLOADING — queries R2's own ListParts (via activeUploadId,
// persisted at upload-url time) rather than anything the anonymous
// uploader's browser reports, since it never phones home mid-upload.
// Deliberately does NOT touch `updatedAt` — that field doubles as the
// upload's start time for average-speed math on the frontend (see
// estimateReceiveProgress), so only lastProgressCheckAt/
// lastProgressUploadedBytes are written here.
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
    const transfer = await studioGetItem<StudioTransfer>(TABLES.transfers, { projectId, transferId })
    if (!transfer || transfer.studioId !== auth.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    if (transfer.direction !== 'RECEIVE' || transfer.status !== 'UPLOADING' || !transfer.r2Key || !transfer.activeUploadId) {
      return NextResponse.json(
        { success: false, error: 'INVALID_STATE', message: 'This transfer has no in-progress receive-upload to check' },
        { status: 409 }
      )
    }

    const lastCheckMs = transfer.lastProgressCheckAt ? new Date(transfer.lastProgressCheckAt).getTime() : 0
    const elapsedMs = Date.now() - lastCheckMs
    if (lastCheckMs > 0 && elapsedMs < RECEIVE_PROGRESS_CHECK_COOLDOWN_MS) {
      return NextResponse.json({
        success: true,
        data: { cached: true, cooldownRemainingSeconds: Math.ceil((RECEIVE_PROGRESS_CHECK_COOLDOWN_MS - elapsedMs) / 1000) },
      })
    }

    let uploadedBytes: number
    try {
      uploadedBytes = await getStudioR2UploadedBytes(transfer.r2Key, transfer.activeUploadId)
    } catch (err) {
      console.error('[transfers check-receive-progress] R2 ListParts failed', err)
      return NextResponse.json(
        { success: false, error: 'CHECK_FAILED', message: 'Could not check progress right now — try again shortly.' },
        { status: 502 }
      )
    }

    const now = new Date().toISOString()
    await studioUpdateItem(
      TABLES.transfers,
      { projectId, transferId },
      'SET lastProgressCheckAt = :now, lastProgressUploadedBytes = :bytes',
      { ':now': now, ':bytes': uploadedBytes }
    )

    return NextResponse.json({
      success: true,
      data: { cached: false, uploadedBytes, cooldownRemainingSeconds: Math.ceil(RECEIVE_PROGRESS_CHECK_COOLDOWN_MS / 1000) },
    })
  } catch (err) {
    console.error('[transfers check-receive-progress POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
