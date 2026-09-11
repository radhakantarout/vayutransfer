import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { completeStudioR2MultipartUpload, abortStudioR2MultipartUpload } from '@/lib/studio/r2'
import { invokeStudioWatermarkLambda } from '@/lib/studio/watermark'
import { resolveProjectForViewer, isOwnerOrAdmin } from '@/lib/studio/galleryMembers'
import type { MediaFile } from '@/types/studio'

// Mirrors admin/projects/[projectId]/upload-complete exactly — same billing
// increment + fire-and-forget watermark invocation (which already no-ops for
// VIDEO files, see lambda/vayustudio-watermark/index.js). Gated to the
// gallery's own admin(s), same as upload-url.
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { fileId, uploadId, parts } = await req.json()
    if (!fileId || !uploadId || !parts?.length) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    const { projectId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved || !isOwnerOrAdmin(auth.studioId, resolved.project, resolved.member)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    const studioId = resolved.project.studioId

    const mediaFile = await studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId })
    if (!mediaFile || mediaFile.studioId !== studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    if (!mediaFile.r2Key) {
      return NextResponse.json({ success: false, error: 'INVALID_STATE', message: 'Missing r2Key' }, { status: 500 })
    }

    try {
      await completeStudioR2MultipartUpload(mediaFile.r2Key, uploadId, parts)
    } catch (err) {
      await abortStudioR2MultipartUpload(mediaFile.r2Key, uploadId).catch(() => {})
      throw err
    }

    const now = new Date().toISOString()

    await studioUpdateItem(
      TABLES.projects,
      { studioId, projectId },
      'ADD totalFiles :one SET updatedAt = :now, #s = :active',
      { ':one': 1, ':now': now, ':active': 'ACTIVE' },
      { '#s': 'status' },
      'attribute_exists(studioId)'
    )

    await studioUpdateItem(
      TABLES.studios,
      { studioId },
      'ADD storageUsedBytes :size, billableStorageBytes :size SET updatedAt = :now',
      { ':size': mediaFile.sizeBytes, ':now': now }
    )

    if (!process.env.WATERMARK_LAMBDA_ARN) {
      await studioUpdateItem(
        TABLES.mediafiles,
        { projectId, fileId },
        'SET processingStatus = :s, uploadedAt = :now',
        { ':s': 'READY', ':now': now }
      )
      return NextResponse.json({ success: true, data: { fileId, status: 'READY' } })
    }

    await studioUpdateItem(
      TABLES.mediafiles,
      { projectId, fileId },
      'SET processingStatus = :s, uploadedAt = :now',
      { ':s': 'PROCESSING', ':now': now }
    )

    invokeStudioWatermarkLambda({
      fileId,
      projectId,
      studioId,
      sourceKey: mediaFile.r2Key,
      sourceBackend: 'R2',
      watermarkEnabled: mediaFile.watermarkEnabled,
      fileType: mediaFile.fileType,
    }).catch((err: unknown) => console.error('[moments watermark-lambda invoke]', err))

    return NextResponse.json({ success: true, data: { fileId, status: 'PROCESSING' } })
  } catch (err) {
    console.error('[moments upload-complete]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
