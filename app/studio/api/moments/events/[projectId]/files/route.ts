import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioQueryByPK, studioQueryByIndex, studioUpdateItem, studioDeleteItem, TABLES } from '@/lib/studio/dynamodb'
import { getMediaPreviewUrl, deleteMediaObjects } from '@/lib/studio/storage'
import { logAuditEvent } from '@/lib/studio/auditLog'
import { resolveProjectForViewer, isOwnerOrAdmin } from '@/lib/studio/galleryMembers'
import type { MediaFile, StudioProject, GalleryLike } from '@/types/studio'

// GET /studio/api/moments/events/[projectId]/files — list photos/videos for
// one Moments event, for the owner OR an approved member (Phase 3). Also
// tags each file with likedByMe (Phase 4) so the grid can render heart
// state without a second round trip per photo.
export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    const { project } = resolved

    const files = await studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', projectId)

    if (!process.env.WATERMARK_LAMBDA_ARN) {
      const stuckFiles = files.filter((f) => f.processingStatus === 'PROCESSING')
      if (stuckFiles.length > 0) {
        const now = new Date().toISOString()
        await Promise.all(
          stuckFiles.map((f) =>
            studioUpdateItem(TABLES.mediafiles, { projectId, fileId: f.fileId },
              'SET processingStatus = :s, uploadedAt = :now',
              { ':s': 'READY', ':now': f.uploadedAt ?? now }
            ).catch(() => {})
          )
        )
        stuckFiles.forEach((f) => { f.processingStatus = 'READY' })
      }
    }

    files.sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder
      return (a.uploadedAt ?? '').localeCompare(b.uploadedAt ?? '')
    })

    // "Did I like this" — one query for the whole gallery via the likes
    // table's userId-index, not one GetItem per photo.
    const myLikes = await studioQueryByIndex<GalleryLike>(
      TABLES.galleryLikes, 'userId-index', 'userId = :u', { ':u': auth.userId }
    ).catch(() => [] as GalleryLike[])
    const likedFileIds = new Set(myLikes.map((l) => l.fileId))

    const enriched = await Promise.all(
      files.map(async (f) => {
        const likedByMe = likedFileIds.has(f.fileId)
        if (f.processingStatus === 'UPLOADING') return { ...f, likedByMe }
        const previewUrl = await getMediaPreviewUrl(f)
        return { ...f, r2PreviewUrl: previewUrl, likedByMe }
      })
    )

    return NextResponse.json({
      success: true,
      data: enriched,
      meta: { allowMemberDownloads: !!project.allowMemberDownloads, allowMemberReels: !!project.allowMemberReels },
    })
  } catch (err) {
    console.error('[moments files GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

// DELETE — mirrors admin's bulk delete exactly (same R2/S3 object cleanup +
// storage decrement), gated to the gallery's own admin(s) — the owner, or
// anyone promoted (Phase 5) — rather than CLIENT+ownership alone, now that a
// gallery can have more than one admin.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    const { project, member } = resolved
    if (!isOwnerOrAdmin(auth.studioId, project, member)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    const studioId = project.studioId

    const { fileIds } = await req.json().catch(() => ({})) as { fileIds?: string[] }
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json({ success: false, error: 'NO_FILE_IDS' }, { status: 400 })
    }

    const files = (await Promise.all(
      fileIds.map((fileId) => studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId }))
    )).filter((f): f is MediaFile => !!f && f.studioId === studioId)

    if (files.length === 0) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    await Promise.all(files.map((f) => deleteMediaObjects(f)))
    await Promise.all(
      files.map((f) => studioDeleteItem(TABLES.mediafiles, { projectId, fileId: f.fileId }))
    )

    const now = new Date().toISOString()
    const totalBytes = files.reduce((sum, f) => sum + (f.sizeBytes ?? 0), 0)

    await studioUpdateItem(
      TABLES.projects,
      { studioId, projectId },
      'ADD totalFiles :neg SET updatedAt = :now',
      { ':neg': -files.length, ':now': now },
      undefined,
      'attribute_exists(studioId)'
    ).catch(() => {})
    await studioUpdateItem(
      TABLES.studios,
      { studioId },
      'ADD billableStorageBytes :negSize SET updatedAt = :now',
      { ':negSize': -totalBytes, ':now': now }
    )

    logAuditEvent({
      studioId,
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'DELETE_PHOTOS',
      targetType: 'PHOTO_BATCH',
      targetId: projectId,
      metadata: { photoCount: files.length, totalBytes, projectId, requestedCount: fileIds.length },
    })

    return NextResponse.json({ success: true, data: { deletedCount: files.length } })
  } catch (err) {
    console.error('[moments files DELETE]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
