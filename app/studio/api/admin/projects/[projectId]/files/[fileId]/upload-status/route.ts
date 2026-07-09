import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { listStudioR2Parts, getStudioR2PartPresignedUrls } from '@/lib/studio/r2'
import type { MediaFile } from '@/types/studio'

// Lets the client resume an interrupted upload instead of restarting from
// scratch: returns which parts R2 actually has recorded for this uploadId
// (the server-side source of truth — never trust the client's local state
// blindly) plus freshly-signed URLs for every part, since presigned URLs
// expire long before a stalled upload might resume.
export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string; fileId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId, fileId } = params
    const uploadId  = req.nextUrl.searchParams.get('uploadId')
    const partCount = parseInt(req.nextUrl.searchParams.get('partCount') ?? '', 10)
    if (!uploadId || !partCount || partCount < 1) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    const file = await studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId })
    if (!file || file.studioId !== auth.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    if (!file.r2Key) {
      return NextResponse.json({ success: false, error: 'NOT_RESUMABLE', message: 'Only R2 uploads support resume' }, { status: 400 })
    }

    const [completedParts, presignedUrls] = await Promise.all([
      listStudioR2Parts(file.r2Key, uploadId).catch(() => null),
      getStudioR2PartPresignedUrls(file.r2Key, uploadId, partCount),
    ])

    if (completedParts === null) {
      // uploadId no longer exists on R2 (expired/aborted) — caller should start fresh
      return NextResponse.json({ success: false, error: 'UPLOAD_EXPIRED' }, { status: 410 })
    }

    return NextResponse.json({ success: true, data: { completedParts, presignedUrls } })
  } catch (err) {
    console.error('[upload-status GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
