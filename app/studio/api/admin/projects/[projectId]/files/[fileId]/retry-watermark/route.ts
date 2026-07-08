import { NextRequest, NextResponse } from 'next/server'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import type { MediaFile, Studio } from '@/types/studio'

const lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

// Re-invokes watermark processing for a file stuck in FAILED/UPLOADING — the
// original bytes are already in S3 (upload-complete already ran), so this is
// a safe retry with no re-upload needed. Mirrors upload-complete's invoke payload.
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
    const studioId = auth.studioId!

    const mediaFile = await studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId })
    if (!mediaFile || mediaFile.studioId !== studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const now = new Date().toISOString()

    if (!process.env.WATERMARK_LAMBDA_ARN) {
      await studioUpdateItem(
        TABLES.mediafiles,
        { projectId, fileId },
        'SET processingStatus = :s, uploadedAt = :now',
        { ':s': 'READY', ':now': now }
      )
      return NextResponse.json({ success: true, data: { fileId, status: 'READY' } })
    }

    await studioUpdateItem(
      TABLES.mediafiles,
      { projectId, fileId },
      'SET processingStatus = :s, uploadedAt = :now',
      { ':s': 'PROCESSING', ':now': now }
    )

    const studio = await studioGetItem<Studio>(TABLES.studios, { studioId })

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
      studioName: studio?.name ?? 'Studio',
      logoS3Key: studio?.brandingConfig?.logoS3Key ?? null,
      watermarkEnabled: mediaFile.watermarkEnabled,
      fileType: mediaFile.fileType,
    }

    lambda.send(new InvokeCommand({
      FunctionName: process.env.WATERMARK_LAMBDA_ARN,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify(lambdaPayload)),
    })).catch((err: unknown) => console.error('[retry-watermark invoke]', err))

    return NextResponse.json({ success: true, data: { fileId, status: 'PROCESSING' } })
  } catch (err) {
    console.error('[retry-watermark]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
