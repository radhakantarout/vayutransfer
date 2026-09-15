import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { listStudioR2Parts, getStudioR2PartPresignedUrls } from '@/lib/studio/r2'
import { resolveProjectForViewer, isOwnerOrAdmin } from '@/lib/studio/galleryMembers'
import type { MediaFile } from '@/types/studio'

// Mirrors admin/.../files/[fileId]/upload-status — resume support for an
// interrupted Moments upload.
export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string; fileId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId, fileId } = params
    const uploadId  = req.nextUrl.searchParams.get('uploadId')
    const partCount = parseInt(req.nextUrl.searchParams.get('partCount') ?? '', 10)
    if (!uploadId || !partCount || partCount < 1) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved || !isOwnerOrAdmin(auth.studioId, resolved.project, resolved.member)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    const file = await studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId })
    if (!file || file.studioId !== resolved.project.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    if (!file.r2Key) {
      return NextResponse.json({ success: false, error: 'NOT_RESUMABLE' }, { status: 400 })
    }

    const [completedParts, presignedUrls] = await Promise.all([
      listStudioR2Parts(file.r2Key, uploadId).catch(() => null),
      getStudioR2PartPresignedUrls(file.r2Key, uploadId, partCount),
    ])

    if (completedParts === null) {
      return NextResponse.json({ success: false, error: 'UPLOAD_EXPIRED' }, { status: 410 })
    }

    return NextResponse.json({ success: true, data: { completedParts, presignedUrls } })
  } catch (err) {
    console.error('[moments upload-status GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
