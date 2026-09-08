import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { listStudioR2Parts, getStudioR2PartPresignedUrls } from '@/lib/studio/r2'
import type { StudioTransfer } from '@/types/studio'

// Lets a Raw Transfer SEND upload resume instead of restarting from scratch —
// direct mirror of .../files/[fileId]/upload-status/route.ts (the studio
// gallery's own resume endpoint), swapped onto StudioTransfer/TABLES.transfers.
// Returns which parts R2 actually has recorded for this uploadId (server-side
// source of truth) plus freshly-signed URLs for every part, since presigned
// URLs expire long before a stalled upload might resume.
export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string; transferId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId, transferId } = params
    const uploadId  = req.nextUrl.searchParams.get('uploadId')
    const partCount = parseInt(req.nextUrl.searchParams.get('partCount') ?? '', 10)
    if (!uploadId || !partCount || partCount < 1) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    const transfer = await studioGetItem<StudioTransfer>(TABLES.transfers, { projectId, transferId })
    if (!transfer || transfer.studioId !== auth.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    if (!transfer.r2Key) {
      return NextResponse.json({ success: false, error: 'NOT_RESUMABLE', message: 'This transfer has no upload to resume' }, { status: 400 })
    }

    const [completedParts, presignedUrls] = await Promise.all([
      listStudioR2Parts(transfer.r2Key, uploadId).catch(() => null),
      getStudioR2PartPresignedUrls(transfer.r2Key, uploadId, partCount),
    ])

    if (completedParts === null) {
      // uploadId no longer exists on R2 (expired/aborted) — caller should start fresh
      return NextResponse.json({ success: false, error: 'UPLOAD_EXPIRED' }, { status: 410 })
    }

    return NextResponse.json({ success: true, data: { completedParts, presignedUrls } })
  } catch (err) {
    console.error('[transfers upload-status GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
