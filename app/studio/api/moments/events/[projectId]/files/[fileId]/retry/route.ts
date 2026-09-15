import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { invokeStudioWatermarkLambda } from '@/lib/studio/watermark'
import { invokeVideoTranscodeLambda } from '@/lib/studio/videoTranscode'
import { resolveProjectForViewer, isOwnerOrAdmin } from '@/lib/studio/galleryMembers'
import type { MediaFile } from '@/types/studio'

// Re-invokes processing for a file stuck FAILED (or a long-stale PROCESSING
// the files-route sweep just flipped to FAILED) — the original bytes are
// already uploaded, so this is a safe retry with no re-upload needed.
// Mirrors upload-complete's own invoke branch exactly. Admin-only, same as
// upload-complete/upload-url.
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string; fileId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId, fileId } = params
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

    const isVideo = mediaFile.fileType === 'VIDEO'
    const lambdaArn = isVideo ? process.env.VIDEO_TRANSCODE_LAMBDA_ARN : process.env.WATERMARK_LAMBDA_ARN
    if (!lambdaArn) {
      return NextResponse.json({ success: false, error: 'NOT_CONFIGURED', message: 'Processing is not configured in this environment' }, { status: 500 })
    }

    const now = new Date().toISOString()
    await studioUpdateItem(
      TABLES.mediafiles,
      { projectId, fileId },
      'SET processingStatus = :s, uploadedAt = :now',
      { ':s': 'PROCESSING', ':now': now }
    )

    const markInvokeFailed = (err: unknown) => {
      console.error('[moments retry] lambda invoke failed', err)
      studioUpdateItem(TABLES.mediafiles, { projectId, fileId }, 'SET processingStatus = :s', { ':s': 'FAILED' })
        .catch((e) => console.error('[moments retry] also failed to mark FAILED', e))
    }

    if (isVideo) {
      invokeVideoTranscodeLambda({ fileId, projectId, studioId, sourceKey: mediaFile.r2Key }).catch(markInvokeFailed)
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
    console.error('[moments retry]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
