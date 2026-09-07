import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { TABLES } from './dynamodb'
import type { WatermarkPreset } from '@/types/studio'

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
  // Required when watermarkEnabled is true — the caller (the watermark
  // route) resolves this ONCE per bulk request (explicit presetId, or the
  // studio's isDefault preset) rather than this function re-reading it from
  // DynamoDB on every single file. Unused when watermarkEnabled is false.
  preset?: WatermarkPreset
  fileType: string
  // Distinguishes a re-generated preview (e.g. after an edited re-upload)
  // from the original. The Lambda uploads previews with a one-year immutable
  // Cache-Control header — reusing the exact same r2Key/URL for a re-edit
  // means browsers/CDNs never re-fetch it, so the old image sticks around
  // forever even though the underlying object changed. A distinct suffix
  // gives every regeneration a brand-new, never-cached URL instead.
  previewKeySuffix?: string
  // Ties this single-file invocation back to the bulk StudioJob row so the
  // Lambda can atomically bump its progress counter — see
  // lambda/vayustudio-watermark/index.js.
  jobId?: string
}

export async function invokeStudioWatermarkLambda(source: WatermarkSource): Promise<void> {
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
    // Destination preview bucket — always R2, unchanged regardless of source
    // backend. A preset's logoR2Key (if any) lives in this SAME bucket (see
    // app/studio/api/admin/settings/watermark-logo-upload/route.ts), so the
    // Lambda can fetch it with these same credentials — no new credentials
    // to thread through for logo watermarks.
    r2Bucket: process.env.STUDIO_R2_BUCKET ?? 'vayutransfer-studio-previews',
    r2Key: `studios/${source.studioId}/projects/${source.projectId}/previews/${previewFilename}.jpg`,
    r2Endpoint: process.env.STUDIO_R2_ENDPOINT,
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID,
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    watermarkEnabled: source.watermarkEnabled,
    preset: source.watermarkEnabled ? source.preset : undefined,
    fileType: source.fileType,
    jobId: source.jobId,
    jobsTable: source.jobId ? TABLES.jobs : undefined,
  }

  await lambda.send(new InvokeCommand({
    FunctionName: process.env.WATERMARK_LAMBDA_ARN!,
    InvocationType: 'Event',
    Payload: Buffer.from(JSON.stringify(payload)),
  }))
}
