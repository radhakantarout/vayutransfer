import { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, DeleteObjectCommand, ListPartsCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { GetObjectCommand } from '@aws-sdk/client-s3'

const s3Client = new S3Client({
  region: process.env.AWS_REGION ?? 'ap-south-1',
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
})

const BUCKET = process.env.S3_BUCKET_NAME ?? 'vayu-transfer-files'

export function getS3Key(fileId: string, fileName: string): string {
  return `uploads/${fileId}/${fileName}`
}

export async function initiateMultipartUpload(
  s3Key: string,
  contentType: string
): Promise<string> {
  const result = await s3Client.send(
    new CreateMultipartUploadCommand({
      Bucket: BUCKET,
      Key: s3Key,
      ContentType: contentType,
    })
  )
  if (!result.UploadId) throw new Error('No UploadId returned from S3')
  return result.UploadId
}

export async function generatePartPresignedUrl(
  s3Key: string,
  uploadId: string,
  partNumber: number
): Promise<string> {
  return getSignedUrl(
    s3Client,
    new UploadPartCommand({
      Bucket: BUCKET,
      Key: s3Key,
      UploadId: uploadId,
      PartNumber: partNumber,
    }),
    { expiresIn: 7200 }  // 2 hours
  )
}

export interface CompletedPart {
  PartNumber: number
  ETag: string
}

export async function completeMultipartUpload(
  s3Key: string,
  uploadId: string,
  parts: CompletedPart[]
): Promise<void> {
  await s3Client.send(
    new CompleteMultipartUploadCommand({
      Bucket: BUCKET,
      Key: s3Key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    })
  )
}

export async function generateDownloadPresignedUrl(
  s3Key: string,
  fileName: string
): Promise<string> {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(fileName)}"`,
    }),
    { expiresIn: 900 }  // 15 minutes
  )
}

// Same object, but "inline" disposition so the browser renders it (image/
// video/audio/pdf) instead of forcing a save-as download — used for the
// no-download-slot-consumed preview affordance, never for the real Download
// button.
export async function generatePreviewPresignedUrl(
  s3Key: string,
  fileName: string
): Promise<string> {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      ResponseContentDisposition: `inline; filename="${encodeURIComponent(fileName)}"`,
    }),
    { expiresIn: 900 }  // 15 minutes
  )
}

export async function abortMultipartUpload(
  s3Key: string,
  uploadId: string
): Promise<void> {
  await s3Client.send(
    new AbortMultipartUploadCommand({
      Bucket: BUCKET,
      Key: s3Key,
      UploadId: uploadId,
    })
  )
}

export async function deleteS3Object(key: string): Promise<void> {
  await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

// Returns null if the uploadId no longer exists on S3 (expired/aborted) —
// caller should treat that as "start fresh," not retry.
export async function listS3Parts(s3Key: string, uploadId: string): Promise<CompletedPart[] | null> {
  try {
    const parts: CompletedPart[] = []
    let partNumberMarker: string | undefined
    do {
      const res = await s3Client.send(new ListPartsCommand({
        Bucket: BUCKET,
        Key: s3Key,
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
