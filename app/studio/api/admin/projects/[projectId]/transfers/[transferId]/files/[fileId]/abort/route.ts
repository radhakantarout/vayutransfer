import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioDeleteItem, TABLES } from '@/lib/studio/dynamodb'
import { abortStudioR2MultipartUpload } from '@/lib/studio/r2'
import { getTransferFiles } from '@/lib/studio/transferBatch'
import type { StudioTransfer, StudioTransferFile } from '@/types/studio'

// Cancels ONE child file's still-in-progress upload within a batch — aborts
// its R2 multipart upload and deletes just that row (never billed pre-
// complete, same as the single-file abort route). If it was the only/last
// remaining child, the parent has nothing left to ever activate, so it's
// cleaned up too rather than left as a permanently-stuck empty batch.
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string; transferId: string; fileId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    const { projectId, transferId, fileId } = params
    const { uploadId } = await req.json().catch(() => ({}))
    if (!uploadId || typeof uploadId !== 'string') {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT', message: 'uploadId is required' }, { status: 400 })
    }

    const transfer = await studioGetItem<StudioTransfer>(TABLES.transfers, { projectId, transferId })
    if (!transfer || transfer.studioId !== auth.studioId || transfer.direction !== 'SEND' || !transfer.fileCount) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    const child = await studioGetItem<StudioTransferFile>(TABLES.transferFiles, { transferId, fileId })
    if (!child) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    await abortStudioR2MultipartUpload(child.r2Key, uploadId).catch((err) => console.error('[transfers batch abort] R2 abort failed', err))
    await studioDeleteItem(TABLES.transferFiles, { transferId, fileId })

    const remaining = (await getTransferFiles(transfer, true)).filter(f => f.fileId !== fileId)
    if (remaining.length === 0) {
      await studioDeleteItem(TABLES.transfers, { projectId, transferId })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[transfers batch abort POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
