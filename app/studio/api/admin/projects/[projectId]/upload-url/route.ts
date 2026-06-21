import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioPutItem, TABLES } from '@/lib/studio/dynamodb'
import { initiateStudioMultipartUpload, getStudioPartPresignedUrls, getStudioS3Key } from '@/lib/studio/s3'
import type { StudioProject, MediaFile } from '@/types/studio'

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { filename, mimeType, sizeBytes, partCount } = await req.json()
    if (!filename || !mimeType || !sizeBytes || !partCount) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }
    if (partCount < 1 || partCount > 10000) {
      return NextResponse.json({ success: false, error: 'INVALID_PART_COUNT' }, { status: 400 })
    }

    const { projectId } = params

    // Verify project belongs to this studio
    const projects = await studioGetItem<StudioProject>(
      TABLES.projects,
      { studioId: auth.studioId, projectId }
    )
    if (!projects) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const studioId = auth.studioId!
    const fileId = randomUUID()
    const fileType = mimeType.startsWith('video/') ? 'VIDEO' : 'IMAGE'
    const s3Key = getStudioS3Key(studioId, projectId, fileId, filename)

    const uploadId = await initiateStudioMultipartUpload(s3Key, mimeType)
    const presignedUrls = await getStudioPartPresignedUrls(s3Key, uploadId, partCount)

    const now = new Date().toISOString()
    const mediaFile: MediaFile = {
      projectId,
      fileId,
      studioId,
      originalFilename: filename,
      fileType,
      mimeType,
      sizeBytes,
      s3Key,
      watermarkEnabled: true,
      displayOrder: Date.now(),
      uploadedAt: now,
      processingStatus: 'UPLOADING',
    }

    await studioPutItem(TABLES.mediafiles, mediaFile as unknown as Record<string, unknown>)

    return NextResponse.json({
      success: true,
      data: { fileId, uploadId, s3Key, presignedUrls },
    })
  } catch (err) {
    console.error('[upload-url]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
