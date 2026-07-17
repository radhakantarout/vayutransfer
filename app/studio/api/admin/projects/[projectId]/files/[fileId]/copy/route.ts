import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioPutItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { getStudioObjectBuffer } from '@/lib/studio/s3'
import { getStudioR2Key, getStudioR2EditedKey, copyStudioR2Object, putStudioR2Object } from '@/lib/studio/r2'
import { invokeStudioWatermarkLambda } from '@/lib/studio/watermark'
import type { MediaFile, StudioProject } from '@/types/studio'

// POST — copy a photo into another event of the SAME client, as an
// independent file (its own fileId, its own storage) — deleting one copy
// never affects the other. Always lands on R2 regardless of the source's
// backend (matching "new content always R2"): a server-side copy when the
// source is already on R2, or read-then-put for a legacy S3 source.
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
    const { targetProjectId } = await req.json().catch(() => ({}))
    if (!targetProjectId || typeof targetProjectId !== 'string') {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT', message: 'targetProjectId is required' }, { status: 400 })
    }

    const [file, sourceProject, targetProject] = await Promise.all([
      studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId }),
      studioGetItem<StudioProject>(TABLES.projects, { studioId: auth.studioId, projectId }),
      studioGetItem<StudioProject>(TABLES.projects, { studioId: auth.studioId, projectId: targetProjectId }),
    ])
    if (!file || file.studioId !== auth.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    if (!sourceProject || !targetProject) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    if (targetProject.clientName !== sourceProject.clientName) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN', message: 'Target event belongs to a different client' }, { status: 403 })
    }

    const studioId = auth.studioId!
    const newFileId = randomUUID()

    const copyOne = async (sourceR2Key: string | undefined, sourceS3Key: string | undefined, destKey: string) => {
      if (sourceR2Key) {
        await copyStudioR2Object(sourceR2Key, destKey)
      } else if (sourceS3Key) {
        const buffer = await getStudioObjectBuffer(sourceS3Key)
        await putStudioR2Object(buffer, destKey, file.mimeType)
      }
    }

    const newOriginalKey = getStudioR2Key(studioId, targetProjectId, newFileId, file.originalFilename)
    await copyOne(file.r2Key, file.s3Key, newOriginalKey)

    let newEditedKey: string | undefined
    if (file.editedR2Key || file.editedS3Key) {
      newEditedKey = getStudioR2EditedKey(studioId, targetProjectId, newFileId, file.originalFilename)
      await copyOne(file.editedR2Key, file.editedS3Key, newEditedKey)
    }

    const now = new Date().toISOString()
    const newFile: MediaFile = {
      projectId: targetProjectId,
      fileId: newFileId,
      studioId,
      originalFilename: file.originalFilename,
      fileType: file.fileType,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      storageBackend: 'R2',
      r2Key: newOriginalKey,
      ...(newEditedKey ? { editedR2Key: newEditedKey } : {}),
      watermarkEnabled: file.watermarkEnabled,
      displayOrder: Date.now(),
      uploadedAt: now,
      processingStatus: process.env.WATERMARK_LAMBDA_ARN ? 'PROCESSING' : 'READY',
      ...(file.curationStatus ? { curationStatus: file.curationStatus } : {}),
    }
    await studioPutItem(TABLES.mediafiles, newFile as unknown as Record<string, unknown>)

    await Promise.all([
      studioUpdateItem(
        TABLES.projects, { studioId, projectId: targetProjectId },
        'ADD totalFiles :one SET updatedAt = :now', { ':one': 1, ':now': now },
        undefined, 'attribute_exists(studioId)'
      ).catch(() => {}),
      // billableStorageBytes + storageUsedBytes — genuinely new storage, same
      // ADD pattern as upload-complete's billing block.
      studioUpdateItem(
        TABLES.studios, { studioId },
        'ADD storageUsedBytes :size, billableStorageBytes :size SET updatedAt = :now',
        { ':size': file.sizeBytes, ':now': now }
      ),
    ])

    if (process.env.WATERMARK_LAMBDA_ARN) {
      invokeStudioWatermarkLambda({
        fileId: newFileId,
        projectId: targetProjectId,
        studioId,
        sourceKey: newOriginalKey,
        sourceBackend: 'R2',
        watermarkEnabled: newFile.watermarkEnabled,
        fileType: newFile.fileType,
      }).catch((err: unknown) => console.error('[watermark-lambda invoke]', err))
    }

    return NextResponse.json({ success: true, data: { fileId: newFileId, targetProjectId } })
  } catch (err) {
    console.error('[files copy POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
