import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'

const lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

interface VideoTranscodeSource {
  fileId: string
  projectId: string
  studioId: string
  sourceKey: string
  // Ties this invocation back to the bulk StudioJob row, same as
  // invokeStudioWatermarkLambda — see lambda/vayustudio-vidtranscode/index.js.
  jobId?: string
}

// Converts a raw uploaded video (very commonly iPhone HEVC/.mov, which only
// Safari can decode) to universally-playable H.264/AAC mp4 — mirrors
// invokeStudioWatermarkLambda's exact credential/payload shape (same R2
// buckets: STUDIO_R2_ORIGINAL_* for the source, STUDIO_R2_BUCKET for the
// public preview destination), just for VIDEO instead of IMAGE, and written
// through the same r2PreviewUrl field + URL construction — the read side
// (lib/studio/storage.ts#getMediaPreviewUrl) already prefers r2PreviewUrl
// once set, so nothing there needs to change.
export async function invokeVideoTranscodeLambda(source: VideoTranscodeSource): Promise<void> {
  const payload = {
    fileId: source.fileId,
    projectId: source.projectId,
    studioId: source.studioId,
    sourceR2Bucket: process.env.STUDIO_R2_ORIGINAL_BUCKET,
    sourceR2Endpoint: process.env.STUDIO_R2_ENDPOINT,
    sourceR2AccessKeyId: process.env.STUDIO_R2_ORIGINAL_ACCESS_KEY_ID,
    sourceR2SecretAccessKey: process.env.STUDIO_R2_ORIGINAL_SECRET_ACCESS_KEY,
    sourceKey: source.sourceKey,
    r2Bucket: process.env.STUDIO_R2_BUCKET ?? 'vayutransfer-studio-previews',
    r2Key: `studios/${source.studioId}/projects/${source.projectId}/previews/${source.fileId}.mp4`,
    r2Endpoint: process.env.STUDIO_R2_ENDPOINT,
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID,
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    jobId: source.jobId,
  }

  await lambda.send(new InvokeCommand({
    FunctionName: process.env.VIDEO_TRANSCODE_LAMBDA_ARN!,
    InvocationType: 'Event',
    Payload: Buffer.from(JSON.stringify(payload)),
  }))
}
