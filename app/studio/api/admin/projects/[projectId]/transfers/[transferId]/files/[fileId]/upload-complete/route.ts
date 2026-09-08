import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { completeStudioR2MultipartUpload, abortStudioR2MultipartUpload } from '@/lib/studio/r2'
import { getTransferFiles } from '@/lib/studio/transferBatch'
import type { StudioTransfer, StudioTransferFile } from '@/types/studio'

// Completes ONE child file's multipart upload within a batch transfer, bills
// that file's own bytes immediately (same as the single-file route — storage
// is billed as bytes actually land, not deferred to whole-batch completion),
// then — once every sibling is UPLOADED — conditionally activates the parent
// transfer. The condition expression guards against two children finishing
// at nearly the same instant both trying to activate the parent.
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
    const { uploadId, parts } = await req.json()
    if (!uploadId || !parts?.length) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    const transfer = await studioGetItem<StudioTransfer>(TABLES.transfers, { projectId, transferId })
    if (!transfer || transfer.studioId !== auth.studioId || transfer.direction !== 'SEND' || !transfer.fileCount) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    const child = await studioGetItem<StudioTransferFile>(TABLES.transferFiles, { transferId, fileId })
    if (!child) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    try {
      await completeStudioR2MultipartUpload(child.r2Key, uploadId, parts)
    } catch (err) {
      await abortStudioR2MultipartUpload(child.r2Key, uploadId).catch(() => {})
      throw err
    }

    const now = new Date().toISOString()
    await studioUpdateItem(
      TABLES.studios,
      { studioId: transfer.studioId },
      'ADD storageUsedBytes :size, billableStorageBytes :size SET updatedAt = :now',
      { ':size': child.sizeBytes, ':now': now }
    )
    await studioUpdateItem(
      TABLES.transferFiles,
      { transferId, fileId },
      'SET #s = :uploaded, updatedAt = :now',
      { ':uploaded': 'UPLOADED', ':now': now },
      { '#s': 'status' }
    )

    // Consistent read — this decides whether to activate the parent, so it
    // must see this request's own just-written status update, not a
    // possibly-stale eventually-consistent replica.
    const siblings = await getTransferFiles(transfer, true)
    const allUploaded = siblings.length > 0 && siblings.every(f => f.status === 'UPLOADED')
    if (allUploaded) {
      await studioUpdateItem(
        TABLES.transfers,
        { projectId, transferId },
        'SET #s = :ready, updatedAt = :now',
        { ':ready': 'READY', ':uploading': 'UPLOADING', ':now': now },
        { '#s': 'status' },
        '#s = :uploading'
      ).catch(() => {}) // ConditionalCheckFailedException = already activated by a concurrent request — fine
    }

    return NextResponse.json({ success: true, data: { status: 'UPLOADED' } })
  } catch (err) {
    console.error('[transfers batch upload-complete POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
