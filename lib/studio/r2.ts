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

// R2 is S3-API-compatible — same SDK, just a custom endpoint + region "auto".
// Deliberately a SEPARATE client/bucket from lib/studio/s3.ts's originals
// bucket, and a separate credential pair from the existing preview-bucket R2
// token (STUDIO_R2_BUCKET/R2_ACCESS_KEY_ID) — keeps blast radius contained if
// either credential ever leaks, and keeps the originals bucket private while
// the preview bucket stays public/CDN-cached.
const studioR2 = new S3Client({
  region: 'auto',
  endpoint: process.env.STUDIO_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.STUDIO_R2_ORIGINAL_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.STUDIO_R2_ORIGINAL_SECRET_ACCESS_KEY ?? '',
  },
})

const STUDIO_R2_ORIGINAL_BUCKET = process.env.STUDIO_R2_ORIGINAL_BUCKET ?? 'vayustudio-original'

// Same key layout as lib/studio/s3.ts's getStudioS3Key/getStudioEditedS3Key —
// a file's key is identical regardless of which backend it lives in, only
// the bucket/client differ. Keeps storageBackend branching mechanical.
export function getStudioR2Key(studioId: string, projectId: string, fileId: string, filename: string) {
  return `studios/${studioId}/projects/${projectId}/originals/${fileId}/${filename}`
}

export function getStudioR2EditedKey(studioId: string, projectId: string, fileId: string, filename: string) {
  return `studios/${studioId}/projects/${projectId}/edited/${fileId}/${filename}`
}

export async function initiateStudioR2MultipartUpload(r2Key: string, contentType: string): Promise<string> {
  const res = await studioR2.send(new CreateMultipartUploadCommand({
    Bucket: STUDIO_R2_ORIGINAL_BUCKET,
    Key: r2Key,
    ContentType: contentType,
  }))
  if (!res.UploadId) throw new Error('No UploadId returned from R2')
  return res.UploadId
}

export async function getStudioR2PartPresignedUrls(
  r2Key: string,
  uploadId: string,
  partCount: number
): Promise<string[]> {
  return Promise.all(
    Array.from({ length: partCount }, (_, i) =>
      getSignedUrl(
        studioR2,
        new UploadPartCommand({ Bucket: STUDIO_R2_ORIGINAL_BUCKET, Key: r2Key, UploadId: uploadId, PartNumber: i + 1 }),
        { expiresIn: 7200 }
      )
    )
  )
}

export async function completeStudioR2MultipartUpload(
  r2Key: string,
  uploadId: string,
  parts: { PartNumber: number; ETag: string }[]
): Promise<void> {
  await studioR2.send(new CompleteMultipartUploadCommand({
    Bucket: STUDIO_R2_ORIGINAL_BUCKET,
    Key: r2Key,
    UploadId: uploadId,
    MultipartUpload: { Parts: parts },
  }))
}

export async function abortStudioR2MultipartUpload(r2Key: string, uploadId: string): Promise<void> {
  await studioR2.send(new AbortMultipartUploadCommand({ Bucket: STUDIO_R2_ORIGINAL_BUCKET, Key: r2Key, UploadId: uploadId }))
}

export async function deleteStudioR2Object(key: string): Promise<void> {
  await studioR2.send(new DeleteObjectCommand({ Bucket: STUDIO_R2_ORIGINAL_BUCKET, Key: key }))
}

export async function getStudioR2SignedViewUrl(key: string): Promise<string> {
  return getSignedUrl(
    studioR2,
    new GetObjectCommand({ Bucket: STUDIO_R2_ORIGINAL_BUCKET, Key: key }),
    { expiresIn: 3600 }
  )
}

export async function getStudioR2ObjectBuffer(key: string): Promise<Buffer> {
  const res = await studioR2.send(new GetObjectCommand({ Bucket: STUDIO_R2_ORIGINAL_BUCKET, Key: key }))
  const bytes = await res.Body!.transformToByteArray()
  return Buffer.from(bytes)
}

export async function getStudioR2SignedDownloadUrl(key: string, filename: string, expiresInSeconds = 3600): Promise<string> {
  return getSignedUrl(
    studioR2,
    new GetObjectCommand({
      Bucket: STUDIO_R2_ORIGINAL_BUCKET,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
    }),
    { expiresIn: expiresInSeconds }
  )
}

export async function getStudioR2EditedPresignedPutUrl(r2Key: string, mimeType: string): Promise<string> {
  return getSignedUrl(
    studioR2,
    new PutObjectCommand({ Bucket: STUDIO_R2_ORIGINAL_BUCKET, Key: r2Key, ContentType: mimeType }),
    { expiresIn: 3600 }
  )
}
