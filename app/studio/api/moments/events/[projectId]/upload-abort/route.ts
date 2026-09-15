import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioDeleteItem, TABLES } from '@/lib/studio/dynamodb'
import { abortStudioR2MultipartUpload } from '@/lib/studio/r2'
import { resolveProjectForViewer, isOwnerOrAdmin } from '@/lib/studio/galleryMembers'
import type { MediaFile } from '@/types/studio'

// POST /studio/api/moments/events/[projectId]/upload-abort — user hit Cancel
// mid-upload. Aborts the live R2 multipart upload (so its parts don't sit
// around billed until R2's own multipart GC) and deletes the placeholder
// MediaFile row created at upload-url time — without this, a cancelled
// upload would leave a permanent ghost row stuck at processingStatus
// 'UPLOADING' with no way to ever complete it.
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { fileId, uploadId } = await req.json().catch(() => ({})) as { fileId?: string; uploadId?: string }
    if (!fileId || !uploadId) return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })

    const { projectId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved || !isOwnerOrAdmin(auth.studioId, resolved.project, resolved.member)) {
      return NextResponse.json({ success: true }) // nothing this caller could clean up anyway
    }
    const mediaFile = await studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId })
    if (!mediaFile || mediaFile.studioId !== resolved.project.studioId) {
      // Already gone — treat as success, there's nothing left to clean up either way.
      return NextResponse.json({ success: true })
    }

    if (mediaFile.r2Key) {
      await abortStudioR2MultipartUpload(mediaFile.r2Key, uploadId).catch(() => {})
    }
    await studioDeleteItem(TABLES.mediafiles, { projectId, fileId })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[moments upload-abort]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
