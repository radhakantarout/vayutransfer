import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioPutItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { invokeStudioWatermarkLambda } from '@/lib/studio/watermark'
import type { StudioTransfer, MediaFile } from '@/types/studio'

// Imports a received (RECEIVE + READY) transfer into the project gallery as
// a normal MediaFile — this is the ONLY point where a raw transfer's file
// ever gets watermarked, and only because it's now becoming gallery-facing.
// Points the new MediaFile straight at the transfer's existing r2Key rather
// than copying bytes (wasteful for large RAW files), and does NOT touch
// billableStorageBytes again — those bytes were already billed when the
// transfer itself completed.
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string; transferId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId, transferId } = params
    const transfer = await studioGetItem<StudioTransfer>(TABLES.transfers, { projectId, transferId })
    if (!transfer || transfer.studioId !== auth.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    if (transfer.direction !== 'RECEIVE' || transfer.status !== 'READY') {
      return NextResponse.json({ success: false, error: 'INVALID_STATE', message: 'Transfer is not a ready RECEIVE transfer' }, { status: 400 })
    }
    if (transfer.importedToGallery) {
      return NextResponse.json({ success: false, error: 'ALREADY_IMPORTED' }, { status: 409 })
    }
    if (!transfer.r2Key || !transfer.filename || !transfer.mimeType || transfer.sizeBytes == null) {
      return NextResponse.json({ success: false, error: 'INVALID_STATE', message: 'Transfer is missing file metadata' }, { status: 500 })
    }

    const studioId = transfer.studioId
    const fileId = randomUUID()
    const fileType = transfer.mimeType.startsWith('video/') ? 'VIDEO' : 'IMAGE'
    const now = new Date().toISOString()

    const mediaFile: MediaFile = {
      projectId,
      fileId,
      studioId,
      originalFilename: transfer.filename,
      fileType,
      mimeType: transfer.mimeType,
      sizeBytes: transfer.sizeBytes,
      storageBackend: 'R2',
      r2Key: transfer.r2Key,
      // Clean by default, same as any other upload — the admin applies
      // watermark explicitly when they want it, not automatically on import.
      watermarkEnabled: false,
      displayOrder: Date.now(),
      uploadedAt: now,
      processingStatus: process.env.WATERMARK_LAMBDA_ARN ? 'PROCESSING' : 'READY',
      importedFromTransferId: transferId,
    }
    await studioPutItem(TABLES.mediafiles, mediaFile as unknown as Record<string, unknown>)

    await studioUpdateItem(
      TABLES.projects,
      { studioId, projectId },
      'ADD totalFiles :one SET updatedAt = :now, #s = :active',
      { ':one': 1, ':now': now, ':active': 'ACTIVE' },
      { '#s': 'status' }
    )

    if (process.env.WATERMARK_LAMBDA_ARN) {
      invokeStudioWatermarkLambda({
        fileId,
        projectId,
        studioId,
        sourceKey: transfer.r2Key,
        sourceBackend: 'R2',
        watermarkEnabled: mediaFile.watermarkEnabled,
        fileType,
      }).catch((err: unknown) => console.error('[watermark-lambda invoke]', err))
    }

    await studioUpdateItem(
      TABLES.transfers,
      { projectId, transferId },
      'SET importedToGallery = :t, importedFileId = :fid, updatedAt = :now',
      { ':t': true, ':fid': fileId, ':now': now }
    )

    return NextResponse.json({ success: true, data: { fileId, processingStatus: mediaFile.processingStatus } })
  } catch (err) {
    console.error('[transfers import POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
