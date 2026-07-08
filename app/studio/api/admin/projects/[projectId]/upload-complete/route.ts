import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { completeStudioMultipartUpload, abortStudioMultipartUpload } from '@/lib/studio/s3'
import { invokeStudioWatermarkLambda } from '@/lib/studio/watermark'
import type { MediaFile } from '@/types/studio'

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { fileId, uploadId, parts } = await req.json()
    if (!fileId || !uploadId || !parts?.length) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    const { projectId } = params
    const studioId = auth.studioId!

    const mediaFile = await studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId })
    if (!mediaFile || mediaFile.studioId !== studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    // Complete S3 multipart upload
    try {
      await completeStudioMultipartUpload(mediaFile.s3Key, uploadId, parts)
    } catch (err) {
      await abortStudioMultipartUpload(mediaFile.s3Key, uploadId).catch(() => {})
      throw err
    }

    const now = new Date().toISOString()

    // Increment project totalFiles
    await studioUpdateItem(
      TABLES.projects,
      { studioId, projectId },
      'ADD totalFiles :one SET updatedAt = :now, #s = :active',
      { ':one': 1, ':now': now, ':active': 'ACTIVE' },
      { '#s': 'status' }
    )

    // storageUsedBytes = historical "Total Upload Size", never decrements.
    // billableStorageBytes = live figure billing/quota checks actually use.
    await studioUpdateItem(
      TABLES.studios,
      { studioId },
      'ADD storageUsedBytes :size, billableStorageBytes :size SET updatedAt = :now',
      { ':size': mediaFile.sizeBytes, ':now': now }
    )

    // No Lambda configured — mark READY immediately (local dev + test environments)
    if (!process.env.WATERMARK_LAMBDA_ARN) {
      await studioUpdateItem(
        TABLES.mediafiles,
        { projectId, fileId },
        'SET processingStatus = :s, uploadedAt = :now',
        { ':s': 'READY', ':now': now }
      )
      console.log(`[SKIP] File ${fileId} marked READY (WATERMARK_LAMBDA_ARN not configured)`)
      return NextResponse.json({ success: true, data: { fileId, status: 'READY' } })
    }

    // Lambda configured — mark PROCESSING and invoke async
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
      s3Key: mediaFile.s3Key,
      watermarkEnabled: mediaFile.watermarkEnabled,
      fileType: mediaFile.fileType,
    }).catch((err: unknown) => console.error('[watermark-lambda invoke]', err))

    return NextResponse.json({ success: true, data: { fileId, status: 'PROCESSING' } })
  } catch (err) {
    console.error('[upload-complete]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
