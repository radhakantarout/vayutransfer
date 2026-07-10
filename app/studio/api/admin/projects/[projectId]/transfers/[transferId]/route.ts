import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, studioDeleteItem, TABLES } from '@/lib/studio/dynamodb'
import { deleteStudioR2Object } from '@/lib/studio/r2'
import type { StudioTransfer, MediaFile } from '@/types/studio'

// Deletes a transfer. If it's already been imported into the gallery, the
// MediaFile record owns that R2 object going forward — blocks instead of
// silently breaking a live gallery photo/video.
export async function DELETE(
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

    if (transfer.importedToGallery) {
      // importedToGallery is set once at import time and never re-checked —
      // if the gallery file was since deleted through the normal photo-delete
      // flow, this flag is stale and nothing actually depends on this
      // transfer's R2 object anymore. Verify against the real MediaFile
      // record rather than trusting the flag blindly.
      const importedFile = transfer.importedFileId
        ? await studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId: transfer.importedFileId })
        : null

      if (importedFile) {
        return NextResponse.json(
          { success: false, error: 'IMPORTED', message: 'This file is already part of the project gallery — delete it from there instead' },
          { status: 409 }
        )
      }

      // Gallery file is already gone — its delete already removed the R2
      // object and decremented billing, so this is just cleaning up the
      // now-orphaned transfer record. Never re-delete R2 or re-decrement.
      await studioDeleteItem(TABLES.transfers, { projectId, transferId })
      return NextResponse.json({ success: true })
    }

    if (transfer.r2Key) {
      await deleteStudioR2Object(transfer.r2Key).catch((err) => console.error('[transfers DELETE] r2 delete failed', err))
    }

    if (transfer.status === 'READY' && transfer.sizeBytes) {
      const now = new Date().toISOString()
      await studioUpdateItem(
        TABLES.studios,
        { studioId: transfer.studioId },
        'ADD billableStorageBytes :negSize SET updatedAt = :now',
        { ':negSize': -transfer.sizeBytes, ':now': now }
      )
    }

    await studioDeleteItem(TABLES.transfers, { projectId, transferId })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[transfers DELETE]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
