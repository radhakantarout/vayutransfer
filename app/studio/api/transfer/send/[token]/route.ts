import { NextRequest, NextResponse } from 'next/server'
import { studioQueryByIndex, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { getStudioR2SignedDownloadUrl } from '@/lib/studio/r2'
import type { StudioTransfer } from '@/types/studio'

// Fully anonymous, no JWT — same pattern as print/gallery/[token]. Lets
// anyone with the link download the raw file the studio owner sent them.
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params
    const transfers = await studioQueryByIndex<StudioTransfer>(
      TABLES.transfers, 'shareToken-index', 'shareToken = :token', { ':token': token }
    )
    const transfer = transfers[0]
    if (!transfer || transfer.direction !== 'SEND') {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    if (new Date(transfer.shareExpiresAt) < new Date()) {
      return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
    }
    if (transfer.status !== 'READY' || !transfer.r2Key || !transfer.filename) {
      return NextResponse.json({ success: false, error: 'NOT_READY' }, { status: 400 })
    }

    const downloadUrl = await getStudioR2SignedDownloadUrl(transfer.r2Key, transfer.filename)

    const now = new Date().toISOString()
    studioUpdateItem(
      TABLES.transfers,
      { projectId: transfer.projectId, transferId: transfer.transferId },
      'ADD downloadCount :one SET lastDownloadedAt = :now',
      { ':one': 1, ':now': now }
    ).catch((e) => console.error('[transfer send download-count update]', e))

    return NextResponse.json({
      success: true,
      data: {
        filename: transfer.filename,
        mimeType: transfer.mimeType,
        sizeBytes: transfer.sizeBytes,
        downloadUrl,
        note: transfer.note ?? null,
      },
    })
  } catch (err) {
    console.error('[transfer send GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
