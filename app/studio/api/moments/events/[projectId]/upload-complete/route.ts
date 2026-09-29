import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { completeStudioR2MultipartUpload, abortStudioR2MultipartUpload } from '@/lib/studio/r2'
import { invokeStudioWatermarkLambda } from '@/lib/studio/watermark'
import { invokeVideoTranscodeLambda } from '@/lib/studio/videoTranscode'
import { resolveProjectForViewer, isOwnerOrAdmin } from '@/lib/studio/galleryMembers'
import type { MediaFile } from '@/types/studio'

// Mirrors admin/projects/[projectId]/upload-complete's billing-increment
// logic, but diverges on which processing Lambda gets invoked: IMAGE goes
// to the shared watermark Lambda (unchanged), VIDEO goes to its own
// transcode Lambda (converts e.g. iPhone HEVC/.mov — unplayable outside
// Safari — to universally-playable H.264/AAC mp4). Both write processingStatus
// + r2PreviewUrl through the identical shape, so nothing downstream of this
// route needs to know which one ran. Gated to the gallery's own admin(s),
// same as upload-url.
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
    if (!resolved) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    const studioId = resolved.project.studioId

    const mediaFile = await studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId })
    if (!mediaFile || mediaFile.studioId !== studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    // Same purpose-aware gate as upload-url — a member who started a
    // REEL_REFERENCE upload there must be able to complete it here too, not
    // just the gallery's owner/admin.
    const canComplete = mediaFile.purpose === 'REEL_REFERENCE'
      ? isOwnerOrAdmin(auth.studioId, resolved.project, resolved.member) || resolved.project.allowMemberReels
      : isOwnerOrAdmin(auth.studioId, resolved.project, resolved.member)
    if (!canComplete) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
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

    // totalFiles is a user-facing "how many photos in this gallery" stat
    // (dashboard totals, and gates whether a share link can even be
    // created) — a reference upload is never a gallery deliverable and must
    // not inflate it, nor flip a still-empty project to ACTIVE as if it now
    // has real shareable content.
    if (mediaFile.purpose !== 'REEL_REFERENCE') {
      await studioUpdateItem(
        TABLES.projects,
        { studioId, projectId },
        'ADD totalFiles :one SET updatedAt = :now, #s = :active',
        { ':one': 1, ':now': now, ':active': 'ACTIVE' },
        { '#s': 'status' },
        'attribute_exists(studioId)'
      )
    }

    await studioUpdateItem(
      TABLES.studios,
      { studioId },
      'ADD storageUsedBytes :size, billableStorageBytes :size SET updatedAt = :now',
      { ':size': mediaFile.sizeBytes, ':now': now }
    )

    // Reference uploads (Kling 3.0 Omni redesign) are never watermarked or
    // transcoded — they're a generation INPUT Kling reads directly via a
    // signed URL, not a client-facing deliverable that needs a browser-
    // playable copy or a watermark overlay. Skip straight to READY, same
    // shortcut shape as the "no Lambda ARN configured" fallback below, but
    // driven by purpose rather than missing config.
    if (mediaFile.purpose === 'REEL_REFERENCE') {
      await studioUpdateItem(
        TABLES.mediafiles,
        { projectId, fileId },
        'SET processingStatus = :s, uploadedAt = :now',
        { ':s': 'READY', ':now': now }
      )
      return NextResponse.json({ success: true, data: { fileId, status: 'READY' } })
    }

    const isVideo = mediaFile.fileType === 'VIDEO'
    const lambdaArn = isVideo ? process.env.VIDEO_TRANSCODE_LAMBDA_ARN : process.env.WATERMARK_LAMBDA_ARN

    if (!lambdaArn) {
      // Local-dev-without-Lambda convenience — but ONLY safe for IMAGE. A
      // VIDEO marked READY with no real r2PreviewUrl serves the raw upload
      // (often undecodable HEVC/.mov) as if it were a working preview,
      // silently reintroducing the crash this whole pipeline was built to
      // fix. Mark it FAILED instead so the UI shows a retry state rather
      // than a broken "ready" file.
      const status = isVideo ? 'FAILED' : 'READY'
      if (isVideo) console.error(`[moments upload-complete] VIDEO_TRANSCODE_LAMBDA_ARN not set — marking ${fileId} FAILED instead of a silent no-op READY`)
      await studioUpdateItem(
        TABLES.mediafiles,
        { projectId, fileId },
        'SET processingStatus = :s, uploadedAt = :now',
        { ':s': status, ':now': now }
      )
      return NextResponse.json({ success: true, data: { fileId, status } })
    }

    await studioUpdateItem(
      TABLES.mediafiles,
      { projectId, fileId },
      'SET processingStatus = :s, uploadedAt = :now',
      { ':s': 'PROCESSING', ':now': now }
    )

    // Fire-and-forget by design (InvocationType: 'Event') — but if the
    // invoke call itself rejects (not the Lambda's own execution — this is
    // a synchronous failure to even hand off the job, e.g. a transient
    // Lambda API error), the file must not stay stuck at PROCESSING forever
    // with nothing ever re-checking it.
    const markInvokeFailed = (err: unknown) => {
      console.error('[moments lambda invoke failed]', err)
      studioUpdateItem(
        TABLES.mediafiles,
        { projectId, fileId },
        'SET processingStatus = :s',
        { ':s': 'FAILED' }
      ).catch((e) => console.error('[moments upload-complete] also failed to mark FAILED', e))
    }

    if (isVideo) {
      invokeVideoTranscodeLambda({
        fileId,
        projectId,
        studioId,
        sourceKey: mediaFile.r2Key,
      }).catch(markInvokeFailed)
    } else {
      invokeStudioWatermarkLambda({
        fileId,
        projectId,
        studioId,
        sourceKey: mediaFile.r2Key,
        sourceBackend: 'R2',
        watermarkEnabled: mediaFile.watermarkEnabled,
        fileType: mediaFile.fileType,
      }).catch(markInvokeFailed)
    }

    return NextResponse.json({ success: true, data: { fileId, status: 'PROCESSING' } })
  } catch (err) {
    console.error('[moments upload-complete]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
