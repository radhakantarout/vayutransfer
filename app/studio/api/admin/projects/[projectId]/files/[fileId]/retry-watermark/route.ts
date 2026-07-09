import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { invokeStudioWatermarkLambda } from '@/lib/studio/watermark'
import type { MediaFile } from '@/types/studio'

// Re-invokes watermark processing for a file stuck in FAILED/UPLOADING — the
// original bytes are already uploaded (upload-complete already ran), so this
// is a safe retry with no re-upload needed. Mirrors upload-complete's invoke.
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string; fileId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId, fileId } = params
    const studioId = auth.studioId!

    const mediaFile = await studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId })
    if (!mediaFile || mediaFile.studioId !== studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const now = new Date().toISOString()

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
      sourceKey: mediaFile.r2Key ?? mediaFile.s3Key!,
      sourceBackend: mediaFile.r2Key ? 'R2' : 'S3',
      watermarkEnabled: mediaFile.watermarkEnabled,
      fileType: mediaFile.fileType,
    }).catch((err: unknown) => console.error('[retry-watermark invoke]', err))

    return NextResponse.json({ success: true, data: { fileId, status: 'PROCESSING' } })
  } catch (err) {
    console.error('[retry-watermark]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
