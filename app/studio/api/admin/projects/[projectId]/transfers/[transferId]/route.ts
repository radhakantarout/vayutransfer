import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, studioDeleteItem, TABLES } from '@/lib/studio/dynamodb'
import { deleteStudioR2Object } from '@/lib/studio/r2'
import type { StudioTransfer } from '@/types/studio'

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
      return NextResponse.json(
        { success: false, error: 'IMPORTED', message: 'This file is already part of the project gallery — delete it from there instead' },
        { status: 409 }
      )
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
