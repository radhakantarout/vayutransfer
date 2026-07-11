import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, studioDeleteItem, TABLES } from '@/lib/studio/dynamodb'
import { deleteMediaObjects } from '@/lib/studio/storage'
import { invokeStudioWatermarkLambda } from '@/lib/studio/watermark'
import type { MediaFile } from '@/types/studio'

// PATCH — toggle watermark, update display order, or rename
export async function PATCH(
  req: NextRequest,
  { params }: { params: { projectId: string; fileId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId, fileId } = params
    const { watermarkEnabled, displayOrder, originalFilename } = await req.json()
    const now = new Date().toISOString()

    const file = await studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId })
    if (!file || file.studioId !== auth.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const updates: string[] = ['updatedAt = :now']
    const values: Record<string, unknown> = { ':now': now }

    if (typeof originalFilename === 'string' && originalFilename.trim().length > 0) {
      updates.push('originalFilename = :fn')
      values[':fn'] = originalFilename.trim()
    }

    if (watermarkEnabled !== undefined) {
      updates.push('watermarkEnabled = :wm')
      values[':wm'] = watermarkEnabled

      // Re-trigger watermark Lambda if toggled — always re-processes the
      // original (not any edited version), matching existing behavior.
      if (process.env.WATERMARK_LAMBDA_ARN) {
        invokeStudioWatermarkLambda({
          fileId,
          projectId,
          studioId: file.studioId,
          sourceKey: file.r2Key ?? file.s3Key!,
          sourceBackend: file.r2Key ? 'R2' : 'S3',
          watermarkEnabled,
          fileType: file.fileType,
          previewKeySuffix: `toggle-${Date.now()}`,
        }).catch((e: unknown) => console.error('[watermark re-invoke]', e))
      }
    }

    if (displayOrder !== undefined) {
      updates.push('displayOrder = :order')
      values[':order'] = displayOrder
    }

    await studioUpdateItem(
      TABLES.mediafiles,
      { projectId, fileId },
      `SET ${updates.join(', ')}`,
      values
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[files PATCH]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

// DELETE — remove file from project
export async function DELETE(
  req: NextRequest,
  { params }: { params: { projectId: string; fileId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId, fileId } = params

    const file = await studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId })
    if (!file || file.studioId !== auth.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    // Delete original + edited copy, whichever backend each is on (best effort)
    await deleteMediaObjects(file)

    // Delete mediafile record + any client selection for this file (best effort cleanup)
    await Promise.all([
      studioDeleteItem(TABLES.mediafiles, { projectId, fileId }),
      studioDeleteItem(TABLES.selections, { projectId, fileId }).catch(() => {}),
    ])

    const now = new Date().toISOString()
    await studioUpdateItem(
      TABLES.projects,
      { studioId: file.studioId, projectId },
      'ADD totalFiles :neg SET updatedAt = :now',
      { ':neg': -1, ':now': now }
    )
    // billableStorageBytes decrement — storageUsedBytes (Total Upload Size)
    // intentionally left untouched, it's the historical/lifetime figure.
    await studioUpdateItem(
      TABLES.studios,
      { studioId: file.studioId },
      'ADD billableStorageBytes :negSize SET updatedAt = :now',
      { ':negSize': -file.sizeBytes, ':now': now }
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[files DELETE]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
