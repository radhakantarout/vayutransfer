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

    // Default view (no ?purpose=) is the normal client-facing gallery —
    // reference uploads for Kling 3.0 Omni (purpose: 'REEL_REFERENCE',
    // reel-generator-omni-redesign plan) are generation inputs, not
    // deliverables, and must never appear in the grid/lightbox. Filtered
    // here (once, before every downstream sweep/enrichment step below) so
    // nothing else in this route has to remember to exclude them.
    // `?purpose=REEL_REFERENCE` is the reel composer's own reference picker
    // fetching the OTHER subset — deliberately not both at once, since the
    // two have no legitimate reason to ever be shown side by side.
    const requestedPurpose = req.nextUrl.searchParams.get('purpose')
    const wantReferences = requestedPurpose === 'REEL_REFERENCE'
    const allFiles = await studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', projectId)
    const files = allFiles.filter((f) => wantReferences ? f.purpose === 'REEL_REFERENCE' : f.purpose !== 'REEL_REFERENCE')

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

    // Same safety net as above, for the OTHER way a file can get stuck
    // forever: the client's own upload-complete call never lands at all
    // (tab closed/crashed, network dropped, app backgrounded mid-request) —
    // nothing else ever re-checks a stuck UPLOADING row either, so without
    // this a tile just shows a generic placeholder icon permanently with no
    // path to recovery (a real production report — a gallery with photos
    // stuck since a 3-days-ago upload attempt). 30 minutes, slightly more
    // generous than PROCESSING's 20: unlike Lambda processing time, actual
    // upload duration is user-connection-dependent, not bounded by a fixed
    // server-side timeout. r2Key is already reserved before the byte upload
    // starts (see upload-url route), so a real object very often already
    // exists at that key even though this app record never heard about it
    // completing — marking FAILED (not deleting) lets the existing Retry
    // action re-invoke processing against it with no re-upload needed.
    const STALE_UPLOADING_MS = 30 * 60 * 1000
    const uploadingCutoff = Date.now() - STALE_UPLOADING_MS
    const staleUploadingFiles = files.filter(
      (f) => f.processingStatus === 'UPLOADING' && f.uploadedAt && new Date(f.uploadedAt).getTime() < uploadingCutoff
    )
    if (staleUploadingFiles.length > 0) {
      await Promise.all(
        staleUploadingFiles.map((f) =>
          studioUpdateItem(
            TABLES.mediafiles, { projectId, fileId: f.fileId },
            'SET processingStatus = :s, failureReason = :r',
            { ':s': 'FAILED', ':r': 'UPLOAD_INCOMPLETE' }
          ).catch(() => {})
        )
      )
      staleUploadingFiles.forEach((f) => { f.processingStatus = 'FAILED'; f.failureReason = 'UPLOAD_INCOMPLETE' })
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
    // Only gallery deliverables ever incremented totalFiles (see
    // upload-complete's own matching guard) — a reference upload's delete
    // must not decrement it, or the count drifts negative/wrong over time.
    const galleryFileCount = files.filter((f) => f.purpose !== 'REEL_REFERENCE').length

    if (galleryFileCount > 0) {
      await studioUpdateItem(
        TABLES.projects,
        { studioId, projectId },
        'ADD totalFiles :neg SET updatedAt = :now',
        { ':neg': -galleryFileCount, ':now': now },
        undefined,
        'attribute_exists(studioId)'
      ).catch(() => {})
    }
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
