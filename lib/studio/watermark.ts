import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { studioGetItem, TABLES } from './dynamodb'
import type { Studio } from '@/types/studio'

const lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

interface WatermarkSource {
  fileId: string
  projectId: string
  studioId: string
  sourceKey: string
  // Which backend sourceKey actually lives on — S3 uses the Lambda's own IAM
  // role (no credentials needed in the payload), R2 needs explicit credentials
  // since it isn't AWS-IAM-integrated.
  sourceBackend: 'S3' | 'R2'
  watermarkEnabled: boolean
  fileType: string
  // Distinguishes a re-generated preview (e.g. after an edited re-upload)
  // from the original. The Lambda uploads previews with a one-year immutable
  // Cache-Control header — reusing the exact same r2Key/URL for a re-edit
  // means browsers/CDNs never re-fetch it, so the old image sticks around
  // forever even though the underlying object changed. A distinct suffix
  // gives every regeneration a brand-new, never-cached URL instead.
  previewKeySuffix?: string
}

export async function invokeStudioWatermarkLambda(source: WatermarkSource): Promise<void> {
  const studio = await studioGetItem<Studio>(TABLES.studios, { studioId: source.studioId })
  const previewFilename = source.previewKeySuffix ? `${source.fileId}-${source.previewKeySuffix}` : source.fileId

  const payload = {
    fileId: source.fileId,
    projectId: source.projectId,
    studioId: source.studioId,
    sourceBackend: source.sourceBackend,
    // S3 source — Lambda reads via its own IAM role.
    s3Bucket: process.env.STUDIO_S3_BUCKET ?? 'vayutransfer-studio-originals',
    // R2 source — separate bucket/credentials from the destination preview
    // bucket below (originals stay private, previews are public/CDN-cached).
    sourceR2Bucket: process.env.STUDIO_R2_ORIGINAL_BUCKET,
    sourceR2Endpoint: process.env.STUDIO_R2_ENDPOINT,
    sourceR2AccessKeyId: process.env.STUDIO_R2_ORIGINAL_ACCESS_KEY_ID,
    sourceR2SecretAccessKey: process.env.STUDIO_R2_ORIGINAL_SECRET_ACCESS_KEY,
    sourceKey: source.sourceKey,
    // Destination preview bucket — always R2, unchanged regardless of source backend.
    r2Bucket: process.env.STUDIO_R2_BUCKET ?? 'vayutransfer-studio-previews',
    r2Key: `studios/${source.studioId}/projects/${source.projectId}/previews/${previewFilename}.jpg`,
    r2Endpoint: process.env.STUDIO_R2_ENDPOINT,
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID,
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    studioName: studio?.name ?? 'Studio',
    logoS3Key: studio?.brandingConfig?.logoS3Key ?? null,
    watermarkEnabled: source.watermarkEnabled,
    fileType: source.fileType,
  }

  await lambda.send(new InvokeCommand({
    FunctionName: process.env.WATERMARK_LAMBDA_ARN!,
    InvocationType: 'Event',
    Payload: Buffer.from(JSON.stringify(payload)),
  }))
}
