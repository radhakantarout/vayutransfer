import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByPK, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { invokeStudioWatermarkLambda } from '@/lib/studio/watermark'
import type { MediaFile } from '@/types/studio'

// Bulk apply/remove watermark — body { fileIds?: string[], watermarkEnabled: boolean }.
// Omitting fileIds targets every eligible file in the project (mirrors
// backfill-previews' "whole project" query shape). Only touches files whose
// bytes actually exist (READY or FAILED — never UPLOADING/PROCESSING, which
// would race the in-flight upload or an already-running watermark job).
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    if (!process.env.WATERMARK_LAMBDA_ARN) {
      return NextResponse.json({ success: false, error: 'LAMBDA_NOT_CONFIGURED' }, { status: 503 })
    }

    const { projectId } = params
    const studioId = auth.studioId!
    const body = await req.json().catch(() => ({}))
    const { fileIds, watermarkEnabled } = body as { fileIds?: string[]; watermarkEnabled?: boolean }
    if (typeof watermarkEnabled !== 'boolean') {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    const allFiles = await studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', projectId)
    const eligible = allFiles.filter((f) =>
      f.studioId === studioId
      && (f.processingStatus === 'READY' || f.processingStatus === 'FAILED')
      && (!fileIds || fileIds.includes(f.fileId))
    )

    if (eligible.length === 0) {
      return NextResponse.json({ success: true, data: { queued: 0, total: 0 } })
    }

    const now = new Date().toISOString()
    let queued = 0
    await Promise.all(
      eligible.map(async (f) => {
        try {
          await studioUpdateItem(
            TABLES.mediafiles,
            { projectId, fileId: f.fileId },
            'SET watermarkEnabled = :wm, updatedAt = :now',
            { ':wm': watermarkEnabled, ':now': now }
          )
          await invokeStudioWatermarkLambda({
            fileId: f.fileId,
            projectId,
            studioId,
            sourceKey: f.r2Key ?? f.s3Key!,
            sourceBackend: f.r2Key ? 'R2' : 'S3',
            watermarkEnabled,
            fileType: f.fileType,
            previewKeySuffix: `wm-${Date.now()}`,
          })
          queued++
        } catch (err) {
          console.error(`[watermark bulk] failed for ${f.fileId}:`, err)
        }
      })
    )

    return NextResponse.json({ success: true, data: { queued, total: eligible.length } })
  } catch (err) {
    console.error('[watermark POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
