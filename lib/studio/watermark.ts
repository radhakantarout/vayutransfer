import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { studioGetItem, TABLES } from './dynamodb'
import type { Studio } from '@/types/studio'

const lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

interface WatermarkSource {
  fileId: string
  projectId: string
  studioId: string
  s3Key: string
  watermarkEnabled: boolean
  fileType: string
}

// Always writes to the SAME r2 key the original upload used
// (studios/{studioId}/projects/{projectId}/previews/{fileId}.jpg) — invoking
// this again after an edited version is uploaded overwrites that preview in
// place, so every consumer reading MediaFile.r2PreviewUrl automatically shows
// the new watermarked content with no other code changes needed.
export async function invokeStudioWatermarkLambda(source: WatermarkSource): Promise<void> {
  const studio = await studioGetItem<Studio>(TABLES.studios, { studioId: source.studioId })

  const payload = {
    fileId: source.fileId,
    projectId: source.projectId,
    studioId: source.studioId,
    s3Bucket: process.env.STUDIO_S3_BUCKET ?? 'vayutransfer-studio-originals',
    s3Key: source.s3Key,
    r2Bucket: process.env.STUDIO_R2_BUCKET ?? 'vayutransfer-studio-previews',
    r2Key: `studios/${source.studioId}/projects/${source.projectId}/previews/${source.fileId}.jpg`,
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
