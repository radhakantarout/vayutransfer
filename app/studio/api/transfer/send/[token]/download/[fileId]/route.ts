import { NextRequest, NextResponse } from 'next/server'
import { studioGetItem, studioQueryByIndex, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { getStudioR2SignedDownloadUrl } from '@/lib/studio/r2'
import type { StudioTransfer, StudioTransferFile } from '@/types/studio'

// Anonymous, no JWT — mints a presigned URL for ONE file within a batch
// transfer, on demand (a click), rather than eagerly for every file on page
// load. Increments that file's own downloadCount plus the parent transfer's
// aggregate (for the existing admin-facing stats) — single-file transfers
// don't use this route at all, they keep their own auto-ready-on-load GET.
export async function POST(
  _req: NextRequest,
  { params }: { params: { token: string; fileId: string } }
) {
  try {
    const { token, fileId } = params
    const transfers = await studioQueryByIndex<StudioTransfer>(
      TABLES.transfers, 'shareToken-index', 'shareToken = :token', { ':token': token }
    )
    const transfer = transfers[0]
    if (!transfer || transfer.direction !== 'SEND' || !transfer.fileCount) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    if (new Date(transfer.shareExpiresAt) < new Date()) {
      return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
    }
    if (transfer.status !== 'READY') {
      return NextResponse.json({ success: false, error: 'NOT_READY' }, { status: 400 })
    }

    const child = await studioGetItem<StudioTransferFile>(TABLES.transferFiles, { transferId: transfer.transferId, fileId })
    if (!child || child.status !== 'UPLOADED') {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const downloadUrl = await getStudioR2SignedDownloadUrl(child.r2Key, child.filename)

    const now = new Date().toISOString()
    studioUpdateItem(
      TABLES.transferFiles, { transferId: transfer.transferId, fileId },
      'ADD downloadCount :one SET updatedAt = :now', { ':one': 1, ':now': now }
    ).catch((e) => console.error('[transfer send batch download-count update]', e))
    studioUpdateItem(
      TABLES.transfers, { projectId: transfer.projectId, transferId: transfer.transferId },
      'ADD downloadCount :one SET lastDownloadedAt = :now', { ':one': 1, ':now': now }
    ).catch((e) => console.error('[transfer send batch parent download-count update]', e))

    return NextResponse.json({ success: true, data: { downloadUrl, filename: child.filename } })
  } catch (err) {
    console.error('[transfer send download POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
