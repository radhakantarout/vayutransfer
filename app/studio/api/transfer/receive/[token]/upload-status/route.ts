import { NextRequest, NextResponse } from 'next/server'
import { studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import { listStudioR2Parts, getStudioR2PartPresignedUrls } from '@/lib/studio/r2'
import type { StudioTransfer } from '@/types/studio'

// Resume support for the anonymous receive-upload flow — mirrors
// files/[fileId]/upload-status, keyed by token instead of JWT+fileId.
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params
    const uploadId  = req.nextUrl.searchParams.get('uploadId')
    const partCount = parseInt(req.nextUrl.searchParams.get('partCount') ?? '', 10)
    if (!uploadId || !partCount || partCount < 1) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

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
    if (!transfer.r2Key) {
      return NextResponse.json({ success: false, error: 'NOT_RESUMABLE' }, { status: 400 })
    }

    const [completedParts, presignedUrls] = await Promise.all([
      listStudioR2Parts(transfer.r2Key, uploadId).catch(() => null),
      getStudioR2PartPresignedUrls(transfer.r2Key, uploadId, partCount),
    ])

    if (completedParts === null) {
      return NextResponse.json({ success: false, error: 'UPLOAD_EXPIRED' }, { status: 410 })
    }

    return NextResponse.json({ success: true, data: { completedParts, presignedUrls } })
  } catch (err) {
    console.error('[transfer receive upload-status GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
