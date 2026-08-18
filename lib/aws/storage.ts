import * as s3 from './s3'
import * as r2 from './r2'
import type { CompletedPart } from './s3'
import type { Transfer } from '@/types'

// Single dispatch point for every VayuTransfer storage operation — routes
// to lib/aws/s3.ts or lib/aws/r2.ts based on storageBackend, mirroring
// lib/studio/storage.ts's role for VayuStudios (kept as a fully separate
// file/implementation per the established no-shared-runtime-code rule).

export type StorageBackend = 'S3' | 'R2'

// Toggle point for Phase 5→6: flip to 'S3' instantly if something's wrong
// during test verification, without touching any route.
export const NEW_UPLOAD_BACKEND: StorageBackend = 'R2'

export function getObjectKey(fileId: string, fileName: string): string {
  return `uploads/${fileId}/${fileName}`
}

// Batch files live under their own fileId, namespaced by the owning
// Transfer's fileId (= batchId) so every object in a batch shares a prefix.
export function getBatchObjectKey(batchId: string, fileId: string, fileName: string): string {
  return `uploads/${batchId}/${fileId}/${fileName}`
}

// The authoritative key for an existing transfer — always reads whichever
// of s3Key/r2Key actually matches storageBackend, never trusts a client-
// supplied value for operations where the DB record is already on hand.
export function transferKey(transfer: Pick<Transfer, 'storageBackend' | 's3Key' | 'r2Key'>): string {
  const key = transfer.storageBackend === 'R2' ? transfer.r2Key : transfer.s3Key
  if (!key) throw new Error(`Transfer has no key for backend ${transfer.storageBackend}`)
  return key
}

export async function initiateUpload(backend: StorageBackend, key: string, contentType: string): Promise<string> {
  return backend === 'R2'
    ? r2.initiateR2MultipartUpload(key, contentType)
    : s3.initiateMultipartUpload(key, contentType)
}

export async function getPartPresignedUrl(backend: StorageBackend, key: string, uploadId: string, partNumber: number): Promise<string> {
  return backend === 'R2'
    ? r2.generateR2PartPresignedUrl(key, uploadId, partNumber)
    : s3.generatePartPresignedUrl(key, uploadId, partNumber)
}

export async function completeUpload(backend: StorageBackend, key: string, uploadId: string, parts: CompletedPart[]): Promise<void> {
  return backend === 'R2'
    ? r2.completeR2MultipartUpload(key, uploadId, parts)
    : s3.completeMultipartUpload(key, uploadId, parts)
}

export async function abortUpload(backend: StorageBackend, key: string, uploadId: string): Promise<void> {
  return backend === 'R2'
    ? r2.abortR2MultipartUpload(key, uploadId)
    : s3.abortMultipartUpload(key, uploadId)
}

// Resume support — returns the parts the backend actually has recorded for
// this uploadId (the server-side source of truth, never trust a client's
// local state blindly) plus freshly-signed URLs for every part, since
// presigned URLs expire long before a stalled upload might resume. Returns
// null completedParts if the uploadId no longer exists (expired/aborted) —
// caller should start a fresh upload in that case.
export async function listUploadedParts(backend: StorageBackend, key: string, uploadId: string): Promise<CompletedPart[] | null> {
  return backend === 'R2' ? r2.listR2Parts(key, uploadId) : s3.listS3Parts(key, uploadId)
}

export async function getAllPartPresignedUrls(backend: StorageBackend, key: string, uploadId: string, partCount: number): Promise<string[]> {
  return Promise.all(
    Array.from({ length: partCount }, (_, i) => getPartPresignedUrl(backend, key, uploadId, i + 1))
  )
}

export async function getDownloadPresignedUrl(transfer: Transfer): Promise<string> {
  return getKeyDownloadPresignedUrl(transfer.storageBackend, transferKey(transfer), transfer.fileName)
}

// Same download-URL dispatch, but for an arbitrary key/backend/display-name
// — used for individual files within a batch (TransferFile rows), which
// aren't full Transfer records themselves.
export async function getKeyDownloadPresignedUrl(backend: StorageBackend, key: string, fileName: string): Promise<string> {
  return backend === 'R2'
    ? r2.generateR2DownloadPresignedUrl(key, fileName)
    : s3.generateDownloadPresignedUrl(key, fileName)
}

// Inline-disposition variant for browser-native preview — never consumes a
// download slot, only used by the preview affordance on the download page.
export async function getKeyPreviewPresignedUrl(backend: StorageBackend, key: string, fileName: string): Promise<string> {
  return backend === 'R2'
    ? r2.generateR2PreviewPresignedUrl(key, fileName)
    : s3.generatePreviewPresignedUrl(key, fileName)
}

export async function deleteStorageObject(transfer: Transfer): Promise<void> {
  const key = transferKey(transfer)
  return transfer.storageBackend === 'R2'
    ? r2.deleteR2Object(key)
    : s3.deleteS3Object(key)
}

// Keyed variant for batch transfers — each raw file lives in its own
// TransferFile record (own key via transferFileKey), not on the Transfer
// record itself, so deleteStorageObject's transfer-level key lookup doesn't
// apply. Used by DELETE /api/transfers/[fileId] to remove every file in a
// batch being permanently deleted.
export async function deleteStorageObjectByKey(backend: StorageBackend, key: string): Promise<void> {
  return backend === 'R2'
    ? r2.deleteR2Object(key)
    : s3.deleteS3Object(key)
}
