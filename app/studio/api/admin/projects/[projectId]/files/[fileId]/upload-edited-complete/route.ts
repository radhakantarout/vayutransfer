import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { invokeStudioWatermarkLambda } from '@/lib/studio/watermark'
import type { MediaFile } from '@/types/studio'

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string; fileId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { editedR2Key } = await req.json()
    if (!editedR2Key) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    const { projectId, fileId } = params

    const file = await studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId })
    if (!file || file.studioId !== auth.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const now = new Date().toISOString()

    if (!process.env.WATERMARK_LAMBDA_ARN) {
      // Dev/test without Lambda configured — same fallback original uploads
      // use: no real watermarking available, just record the edited key.
      await studioUpdateItem(
        TABLES.mediafiles,
        { projectId, fileId },
        'SET editedR2Key = :key, updatedAt = :now',
        { ':key': editedR2Key, ':now': now }
      )
      return NextResponse.json({ success: true, data: { status: 'READY' } })
    }

    // Record the edited key immediately, then re-run the SAME watermark
    // pipeline against it, writing to the same preview key the original
    // occupies — this is what keeps every consumer (admin grid, client
    // gallery, print portal) in sync without touching their read paths.
    await studioUpdateItem(
      TABLES.mediafiles,
      { projectId, fileId },
      'SET editedR2Key = :key, processingStatus = :s, updatedAt = :now',
      { ':key': editedR2Key, ':s': 'PROCESSING', ':now': now }
    )

    invokeStudioWatermarkLambda({
      fileId,
      projectId,
      studioId: file.studioId,
      sourceKey: editedR2Key,
      sourceBackend: 'R2',
      watermarkEnabled: file.watermarkEnabled,
      fileType: file.fileType,
      previewKeySuffix: `edited-${Date.now()}`,
    }).catch((err: unknown) => console.error('[watermark-lambda invoke — edited]', err))

    return NextResponse.json({ success: true, data: { status: 'PROCESSING' } })
  } catch (err) {
    console.error('[upload-edited-complete POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
