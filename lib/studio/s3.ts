import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getSignedUrl as getCFSignedUrl } from '@aws-sdk/cloudfront-signer'

const studioS3 = new S3Client({
  region: process.env.AWS_REGION ?? 'ap-south-1',
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
      : undefined,
})

const STUDIO_BUCKET = process.env.STUDIO_S3_BUCKET ?? 'vayutransfer-studio-originals'

export function getStudioS3Key(studioId: string, projectId: string, fileId: string, filename: string) {
  return `studios/${studioId}/projects/${projectId}/originals/${fileId}/${filename}`
}

export function getStudioEditedS3Key(studioId: string, projectId: string, fileId: string, filename: string) {
  return `studios/${studioId}/projects/${projectId}/edited/${fileId}/${filename}`
}

export function getStudioZipKey(studioId: string, jobId: string) {
  return `studios/${studioId}/zips/${jobId}.zip`
}

export async function initiateStudioMultipartUpload(s3Key: string, contentType: string): Promise<string> {
  const res = await studioS3.send(new CreateMultipartUploadCommand({
    Bucket: STUDIO_BUCKET,
    Key: s3Key,
    ContentType: contentType,
  }))
  if (!res.UploadId) throw new Error('No UploadId returned from S3')
  return res.UploadId
}

export async function getStudioPartPresignedUrls(
  s3Key: string,
  uploadId: string,
  partCount: number
): Promise<string[]> {
  return Promise.all(
    Array.from({ length: partCount }, (_, i) =>
      getSignedUrl(
        studioS3,
        new UploadPartCommand({ Bucket: STUDIO_BUCKET, Key: s3Key, UploadId: uploadId, PartNumber: i + 1 }),
        { expiresIn: 7200 }
      )
    )
  )
}

export async function completeStudioMultipartUpload(
  s3Key: string,
  uploadId: string,
  parts: { PartNumber: number; ETag: string }[]
): Promise<void> {
  await studioS3.send(new CompleteMultipartUploadCommand({
    Bucket: STUDIO_BUCKET,
    Key: s3Key,
    UploadId: uploadId,
    MultipartUpload: { Parts: parts },
  }))
}

export async function abortStudioMultipartUpload(s3Key: string, uploadId: string): Promise<void> {
  await studioS3.send(new AbortMultipartUploadCommand({ Bucket: STUDIO_BUCKET, Key: s3Key, UploadId: uploadId }))
}

export async function deleteStudioS3Object(key: string): Promise<void> {
  await studioS3.send(new DeleteObjectCommand({ Bucket: STUDIO_BUCKET, Key: key }))
}

export async function getStudioSignedDownloadUrl(key: string, filename: string): Promise<string> {
  return getSignedUrl(
    studioS3,
    new GetObjectCommand({
      Bucket: STUDIO_BUCKET,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
    }),
    { expiresIn: 3600 }
  )
}

export async function getStudioEditedPresignedPutUrl(s3Key: string, mimeType: string): Promise<string> {
  return getSignedUrl(
    studioS3,
    new PutObjectCommand({ Bucket: STUDIO_BUCKET, Key: s3Key, ContentType: mimeType }),
    { expiresIn: 3600 }
  )
}

// CloudFront signed URL for print-quality downloads (originals or edited finals)
export function getStudioCloudFrontSignedUrl(s3Key: string, expiresInSeconds = 604800): string {
  const privateKey = (process.env.STUDIO_CLOUDFRONT_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
  const keyPairId  = process.env.STUDIO_CLOUDFRONT_KEY_PAIR_ID ?? ''
  const domain     = (process.env.STUDIO_CLOUDFRONT_DOMAIN ?? '').replace(/\/$/, '')
  return getCFSignedUrl({
    url: `${domain}/${s3Key}`,
    keyPairId,
    privateKey,
    dateLessThan: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
  })
}
