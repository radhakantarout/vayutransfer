import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioDeleteItem, TABLES } from '@/lib/studio/dynamodb'
import { abortStudioR2MultipartUpload } from '@/lib/studio/r2'
import { logAuditEvent } from '@/lib/studio/auditLog'
import type { StudioTransfer } from '@/types/studio'

// Cancels a SEND transfer that's still mid-upload — the client already holds
// the uploadId from its own initiate call (never persisted server-side on
// the transfer record, same as the regular gallery upload flow), so it's
// passed in the body here rather than looked up. Aborts the R2 multipart
// upload (no real object exists yet, just abandoned parts) and deletes the
// DynamoDB record outright — an UPLOADING transfer was never billed
// (billing only happens at upload-complete), so there's nothing to refund.
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
    const { uploadId } = await req.json().catch(() => ({}))
    if (!uploadId || typeof uploadId !== 'string') {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT', message: 'uploadId is required' }, { status: 400 })
    }

    const transfer = await studioGetItem<StudioTransfer>(TABLES.transfers, { projectId, transferId })
    if (!transfer || transfer.studioId !== auth.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    if (transfer.direction !== 'SEND' || transfer.status !== 'UPLOADING') {
      return NextResponse.json(
        { success: false, error: 'INVALID_STATE', message: 'Only an in-progress send upload can be cancelled' },
        { status: 409 }
      )
    }

    if (transfer.r2Key) {
      await abortStudioR2MultipartUpload(transfer.r2Key, uploadId).catch((err) => console.error('[transfers abort] R2 abort failed', err))
    }
    await studioDeleteItem(TABLES.transfers, { projectId, transferId })

    logAuditEvent({
      studioId: transfer.studioId,
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'DELETE_TRANSFER',
      targetType: 'TRANSFER',
      targetId: transferId,
      metadata: { projectId, filename: transfer.filename, direction: transfer.direction, cancelledMidUpload: true },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[transfers abort POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
