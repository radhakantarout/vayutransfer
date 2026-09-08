import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { listStudioR2Parts, getStudioR2PartPresignedUrls } from '@/lib/studio/r2'
import type { StudioTransfer, StudioTransferFile } from '@/types/studio'

// Resume-status for ONE child file within a batch transfer — identical
// pattern to .../transfers/[transferId]/upload-status (the single-file
// route), just keyed by the child's own fileId instead of the transferId.
export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string; transferId: string; fileId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId, transferId, fileId } = params
    const uploadId  = req.nextUrl.searchParams.get('uploadId')
    const partCount = parseInt(req.nextUrl.searchParams.get('partCount') ?? '', 10)
    if (!uploadId || !partCount || partCount < 1) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    const transfer = await studioGetItem<StudioTransfer>(TABLES.transfers, { projectId, transferId })
    if (!transfer || transfer.studioId !== auth.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    const child = await studioGetItem<StudioTransferFile>(TABLES.transferFiles, { transferId, fileId })
    if (!child || !child.r2Key) {
      return NextResponse.json({ success: false, error: 'NOT_RESUMABLE' }, { status: 400 })
    }

    const [completedParts, presignedUrls] = await Promise.all([
      listStudioR2Parts(child.r2Key, uploadId).catch(() => null),
      getStudioR2PartPresignedUrls(child.r2Key, uploadId, partCount),
    ])

    if (completedParts === null) {
      return NextResponse.json({ success: false, error: 'UPLOAD_EXPIRED' }, { status: 410 })
    }

    return NextResponse.json({ success: true, data: { completedParts, presignedUrls } })
  } catch (err) {
    console.error('[transfers batch upload-status GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
