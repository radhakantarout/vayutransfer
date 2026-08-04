import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioQueryByPK, studioUpdateItem, studioDeleteItem, TABLES } from '@/lib/studio/dynamodb'
import { getMediaPreviewUrl, deleteMediaObjects } from '@/lib/studio/storage'
import { logAuditEvent } from '@/lib/studio/auditLog'
import type { MediaFile, StudioProject } from '@/types/studio'

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId } = params
    const studioId = auth.studioId!

    const project = await studioGetItem<StudioProject>(TABLES.projects, { studioId, projectId })
    if (!project) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    // projectId is the table PK — query main table directly, no GSI needed
    const files = await studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', projectId)

    // Auto-heal: if Lambda not configured and any files are stuck PROCESSING, mark them READY now
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
        console.log(`[auto-heal] Marked ${stuckFiles.length} stuck files READY for project ${projectId}`)
      }
    }

    // Sort by displayOrder then uploadedAt
    files.sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder
      return (a.uploadedAt ?? '').localeCompare(b.uploadedAt ?? '')
    })

    // The studio owner is the owner of their own originals — the admin grid
    // shouldn't gate on the watermark Lambda finishing at all. getMediaPreviewUrl
    // already falls back to a raw signed view of the current file when no
    // watermark preview exists yet (or watermarking failed), so as soon as a
    // file's bytes actually exist in R2/S3 it gets *some* viewable image —
    // watermarked once the Lambda finishes, the real original before/if it
    // hasn't. Only skip files still 'UPLOADING': the multipart upload hasn't
    // been completed yet, so there's no real object behind the key and a
    // signed URL would just 404.
    const enriched = await Promise.all(
      files.map(async (f) => {
        if (f.processingStatus === 'UPLOADING') return f
        const previewUrl = await getMediaPreviewUrl(f)
        return { ...f, r2PreviewUrl: previewUrl, isEdited: !!(f.editedS3Key || f.editedR2Key) }
      })
    )

    // Auto-heal: keep project.totalFiles in sync with the actual file count.
    // Guarded with attribute_exists — UpdateItem upserts by default, so without
    // this a deleted/stale projectId (e.g. leftover mediafiles, a stale tab)
    // would silently resurrect a bare-bones ghost project record.
    studioUpdateItem(
      TABLES.projects,
      { studioId: auth.studioId!, projectId },
      'SET totalFiles = :tf',
      { ':tf': files.length },
      undefined,
      'attribute_exists(studioId)'
    ).catch(() => {})

    return NextResponse.json({ success: true, data: enriched })
  } catch (err) {
    console.error('[files GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

// DELETE — bulk-remove multiple photos from this project in one request.
// Replaces the old pattern of firing one DELETE per fileId from the client
// (EventSection.tsx's deleteFiles()) — besides being one network round trip
// instead of N, a 40-photo delete now produces exactly ONE audit log entry
// with the full batch's photoCount/bytes, not 40 separate ones.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId } = params
    const { fileIds } = await req.json().catch(() => ({})) as { fileIds?: string[] }
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json({ success: false, error: 'NO_FILE_IDS' }, { status: 400 })
    }

    const project = await studioGetItem<StudioProject>(TABLES.projects, { studioId: auth.studioId, projectId })
    if (!project) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    const files = (await Promise.all(
      fileIds.map((fileId) => studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId }))
    )).filter((f): f is MediaFile => !!f && f.studioId === auth.studioId)

    if (files.length === 0) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    await Promise.all(files.map((f) => deleteMediaObjects(f)))
    await Promise.all([
      ...files.map((f) => studioDeleteItem(TABLES.mediafiles, { projectId, fileId: f.fileId })),
      ...files.map((f) => studioDeleteItem(TABLES.selections, { projectId, fileId: f.fileId }).catch(() => {})),
    ])

    const now = new Date().toISOString()
    const totalBytes = files.reduce((sum, f) => sum + (f.sizeBytes ?? 0), 0)

    await studioUpdateItem(
      TABLES.projects,
      { studioId: auth.studioId, projectId },
      'ADD totalFiles :neg SET updatedAt = :now',
      { ':neg': -files.length, ':now': now },
      undefined,
      'attribute_exists(studioId)'
    ).catch(() => {})
    // billableStorageBytes decrement — storageUsedBytes (Total Upload Size)
    // intentionally left untouched, it's the historical/lifetime figure.
    await studioUpdateItem(
      TABLES.studios,
      { studioId: auth.studioId },
      'ADD billableStorageBytes :negSize SET updatedAt = :now',
      { ':negSize': -totalBytes, ':now': now }
    )

    logAuditEvent({
      studioId: auth.studioId!,
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'DELETE_PHOTOS',
      targetType: 'PHOTO_BATCH',
      targetId: projectId,
      metadata: {
        photoCount: files.length,
        totalBytes,
        projectId,
        clientName: project.clientName,
        eventType: project.eventType,
        requestedCount: fileIds.length,
        notFoundCount: fileIds.length - files.length,
      },
    })

    return NextResponse.json({ success: true, data: { deletedCount: files.length } })
  } catch (err) {
    console.error('[files bulk DELETE]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
