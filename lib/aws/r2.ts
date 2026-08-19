import { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, DeleteObjectCommand, ListPartsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import type { CompletedPart } from './s3'

// Mirrors lib/aws/s3.ts exactly — separate client, separate bucket, kept as
// its own file (not shared with lib/studio/r2.ts) per the established rule
// that VayuTransfer and VayuStudios never share runtime storage code, even
// though both talk to R2.
const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_TRANSFER_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_TRANSFER_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_TRANSFER_SECRET_ACCESS_KEY ?? '',
  },
  // R2-compat setting for newer AWS SDK v3 versions that auto-add a CRC32
  // checksum requirement R2 doesn't support — same defensive flag already
  // applied on the VayuStudios R2 client.
  requestChecksumCalculation: 'WHEN_REQUIRED',
})

const BUCKET = process.env.R2_TRANSFER_BUCKET ?? ''

export async function initiateR2MultipartUpload(
  r2Key: string,
  contentType: string
): Promise<string> {
  const result = await r2Client.send(
    new CreateMultipartUploadCommand({
      Bucket: BUCKET,
      Key: r2Key,
      ContentType: contentType,
    })
  )
  if (!result.UploadId) throw new Error('No UploadId returned from R2')
  return result.UploadId
}

export async function generateR2PartPresignedUrl(
  r2Key: string,
  uploadId: string,
  partNumber: number
): Promise<string> {
  return getSignedUrl(
    r2Client,
    new UploadPartCommand({
      Bucket: BUCKET,
      Key: r2Key,
      UploadId: uploadId,
      PartNumber: partNumber,
    }),
    { expiresIn: 7200 }  // 2 hours
  )
}

export async function completeR2MultipartUpload(
  r2Key: string,
  uploadId: string,
  parts: CompletedPart[]
): Promise<void> {
  await r2Client.send(
    new CompleteMultipartUploadCommand({
      Bucket: BUCKET,
      Key: r2Key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    })
  )
}

export async function generateR2DownloadPresignedUrl(
  r2Key: string,
  fileName: string
): Promise<string> {
  return getSignedUrl(
    r2Client,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: r2Key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(fileName)}"`,
    }),
    { expiresIn: 900 }  // 15 minutes
  )
}

// Same object, "inline" disposition — see s3.ts's generatePreviewPresignedUrl
// for why this is a separate function from the real Download URL.
export async function generateR2PreviewPresignedUrl(
  r2Key: string,
  fileName: string
): Promise<string> {
  return getSignedUrl(
    r2Client,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: r2Key,
      ResponseContentDisposition: `inline; filename="${encodeURIComponent(fileName)}"`,
    }),
    { expiresIn: 900 }  // 15 minutes
  )
}

export async function abortR2MultipartUpload(
  r2Key: string,
  uploadId: string
): Promise<void> {
  await r2Client.send(
    new AbortMultipartUploadCommand({
      Bucket: BUCKET,
      Key: r2Key,
      UploadId: uploadId,
    })
  )
}

export async function deleteR2Object(key: string): Promise<void> {
  await r2Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

// Returns null if the uploadId no longer exists on R2 (expired/aborted) —
// caller should treat that as "start fresh," not retry.
export async function listR2Parts(r2Key: string, uploadId: string): Promise<CompletedPart[] | null> {
  try {
    const parts: CompletedPart[] = []
    let partNumberMarker: string | undefined
    do {
      const res = await r2Client.send(new ListPartsCommand({
        Bucket: BUCKET,
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
  } catch {
    return null
  }
}

// Platform-admin only (app/api/admin/r2-sync) — full bucket listing, never
// called on a user-facing path. Capped iteration count as a safety net
// against a runaway loop if ContinuationToken pagination ever misbehaves.
const MAX_LIST_PAGES = 2000

export async function listR2BucketStats(): Promise<{ totalObjects: number; totalBytes: number }> {
  let totalObjects = 0
  let totalBytes = 0
  let continuationToken: string | undefined
  let pages = 0

  do {
    const res = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      })
    )
    for (const obj of res.Contents ?? []) {
      totalObjects += 1
      totalBytes += obj.Size ?? 0
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
    pages += 1
  } while (continuationToken && pages < MAX_LIST_PAGES)

  return { totalObjects, totalBytes }
}
