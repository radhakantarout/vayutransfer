import { NextRequest, NextResponse } from 'next/server'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { completeStudioMultipartUpload, abortStudioMultipartUpload } from '@/lib/studio/s3'
import type { MediaFile, Studio } from '@/types/studio'

const lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

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

    // Mark file as PROCESSING
    await studioUpdateItem(
      TABLES.mediafiles,
      { projectId, fileId },
      'SET processingStatus = :s, uploadedAt = :now',
      { ':s': 'PROCESSING', ':now': now }
    )

    // Increment project totalFiles
    await studioUpdateItem(
      TABLES.projects,
      { studioId, projectId },
      'ADD totalFiles :one SET updatedAt = :now, #s = :active',
      { ':one': 1, ':now': now, ':active': 'ACTIVE' },
      { '#s': 'status' }
    )

    // Update studio storage usage
    await studioUpdateItem(
      TABLES.studios,
      { studioId },
      'ADD storageUsedBytes :size SET updatedAt = :now',
      { ':size': mediaFile.sizeBytes, ':now': now }
    )

    // Get studio branding for watermark Lambda
    const studio = await studioGetItem<Studio>(TABLES.studios, { studioId })

    // Trigger watermark Lambda asynchronously (fire-and-forget)
    const lambdaPayload = {
      fileId,
      projectId,
      studioId,
      s3Bucket: process.env.STUDIO_S3_BUCKET ?? 'vayutransfer-studio-originals',
      s3Key: mediaFile.s3Key,
      r2Bucket: process.env.STUDIO_R2_BUCKET ?? 'vayutransfer-studio-previews',
      r2Key: `studios/${studioId}/projects/${projectId}/previews/${fileId}.jpg`,
      r2Endpoint: process.env.STUDIO_R2_ENDPOINT,
      r2AccessKeyId: process.env.R2_ACCESS_KEY_ID,
      r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      logoS3Key: studio?.brandingConfig?.logoS3Key ?? null,
      watermarkEnabled: mediaFile.watermarkEnabled,
      fileType: mediaFile.fileType,
    }

    if (process.env.WATERMARK_LAMBDA_ARN) {
      lambda.send(new InvokeCommand({
        FunctionName: process.env.WATERMARK_LAMBDA_ARN,
        InvocationType: 'Event', // async
        Payload: Buffer.from(JSON.stringify(lambdaPayload)),
      })).catch((err: unknown) => console.error('[watermark-lambda invoke]', err))
    } else {
      console.log('[DEV] Watermark Lambda skipped — WATERMARK_LAMBDA_ARN not set')
    }

    return NextResponse.json({ success: true, data: { fileId, status: 'PROCESSING' } })
  } catch (err) {
    console.error('[upload-complete]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
