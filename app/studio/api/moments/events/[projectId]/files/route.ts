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

    if (!process.env.WATERMARK_LAMBDA_ARN || !process.env.VIDEO_TRANSCODE_LAMBDA_ARN) {
      // Only force-flip files whose OWN processing Lambda is actually
      // unconfigured — previously checked WATERMARK_LAMBDA_ARN alone, which
      // could force-flip a video legitimately mid-transcode (with its own
      // Lambda configured and running) to READY prematurely whenever only
      // the image Lambda's ARN happened to be missing.
      const stuckFiles = files.filter((f) =>
        f.processingStatus === 'PROCESSING' &&
        !process.env[f.fileType === 'VIDEO' ? 'VIDEO_TRANSCODE_LAMBDA_ARN' : 'WATERMARK_LAMBDA_ARN']
      )
      if (stuckFiles.length > 0) {
        const now = new Date().toISOString()
        await Promise.all(
          stuckFiles.map((f) => {
            // Safe for IMAGE (raw upload is still directly viewable) but
            // NOT for VIDEO — marking a video READY with no real
            // r2PreviewUrl serves the raw, often-undecodable upload as if
            // it were a working preview (the exact bug the transcode
            // pipeline was built to fix). Matches upload-complete route's
            // same IMAGE-only shortcut.
            const status = f.fileType === 'VIDEO' ? 'FAILED' : 'READY'
            return studioUpdateItem(TABLES.mediafiles, { projectId, fileId: f.fileId },
              'SET processingStatus = :s, uploadedAt = :now',
              { ':s': status, ':now': f.uploadedAt ?? now }
            ).catch(() => {}).then(() => { f.processingStatus = status })
          })
        )
      }
    }

    // Production safety net: a Lambda hard-timeout/OOM kill happens before
    // its own catch block can write FAILED, and a rejected fire-and-forget
    // invoke is handled at invoke time (upload-complete route) but can't
    // cover every failure mode. Nothing else ever re-checks a PROCESSING
    // row, so without this it can stay stuck forever with a permanent
    // spinner. 20 minutes is comfortably past the Lambda's own 900s/15min
    // hard cap.
    const STALE_PROCESSING_MS = 20 * 60 * 1000
    const staleCutoff = Date.now() - STALE_PROCESSING_MS
    const staleFiles = files.filter(
      (f) => f.processingStatus === 'PROCESSING' && f.uploadedAt && new Date(f.uploadedAt).getTime() < staleCutoff
    )
    if (staleFiles.length > 0) {
      await Promise.all(
        staleFiles.map((f) =>
          studioUpdateItem(TABLES.mediafiles, { projectId, fileId: f.fileId }, 'SET processingStatus = :s', { ':s': 'FAILED' }).catch(() => {})
        )
      )
      staleFiles.forEach((f) => { f.processingStatus = 'FAILED' })
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
      meta: {
        allowMemberDownloads: !!project.allowMemberDownloads,
        allowMemberReels: !!project.allowMemberReels,
        allowOriginalDownloads: !!project.allowOriginalDownloads,
      },
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
