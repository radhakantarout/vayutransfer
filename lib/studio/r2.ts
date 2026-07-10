import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  ListPartsCommand,
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
  // AWS SDK v3 defaults to auto-adding CRC32 checksum requirements
  // (x-amz-checksum-crc32 / x-amz-sdk-checksum-algorithm) to presigned
  // upload URLs since ~3.729 — R2 doesn't support this the same way S3
  // does, which silently breaks CompleteMultipartUpload and leaves the
  // upload stuck as "Ongoing Multipart Upload" forever. Disabling this
  // (only compute checksums when an API explicitly requires them) is the
  // standard fix for R2 compatibility.
  requestChecksumCalculation: 'WHEN_REQUIRED',
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

// Raw file transfers get their own namespace, distinct from originals/edited —
// these are transient (send/receive links, not gallery-facing) until/unless
// explicitly imported into the gallery via a MediaFile record.
export function getStudioR2TransferKey(studioId: string, projectId: string, transferId: string, filename: string) {
  return `studios/${studioId}/projects/${projectId}/transfers/${transferId}/${filename}`
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

// Server-side source of truth for which parts an in-progress multipart
// upload actually has, used to resume an interrupted upload safely instead
// of trusting the client's local state blindly.
export async function listStudioR2Parts(
  r2Key: string,
  uploadId: string
): Promise<{ PartNumber: number; ETag: string }[]> {
  const parts: { PartNumber: number; ETag: string }[] = []
  let partNumberMarker: string | undefined
  do {
    const res = await studioR2.send(new ListPartsCommand({
      Bucket: STUDIO_R2_ORIGINAL_BUCKET,
      Key: r2Key,
      UploadId: uploadId,
      PartNumberMarker: partNumberMarker,
    }))
    for (const p of res.Parts ?? []) {
      if (p.PartNumber != null && p.ETag) parts.push({ PartNumber: p.PartNumber, ETag: p.ETag })
    }
    partNumberMarker = res.IsTruncated ? res.NextPartNumberMarker : undefined
  } while (partNumberMarker)
  return parts
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
