// Resume-aware transfer creation for Raw Transfer SEND — mirrors
// EventSection.tsx's initOrResumeUpload exactly, just pointed at the
// transfers routes instead of the gallery files routes. Reuses
// lib/studio/uploadResume.ts as-is (its `fileId` field just holds a
// transferId for this caller) and lib/studio/clientUpload.ts's
// fetchWithTimeout/PartRecord — no new resilience primitives, just correct
// wiring of what already exists.

import { CHUNK_SIZE, fetchWithTimeout, type PartRecord } from './clientUpload'
import { loadUploadResume, saveUploadResume, clearUploadResume } from './uploadResume'

export interface TransferUploadInit {
  transferId: string
  uploadId: string
  presignedUrls: string[]
  completedParts: PartRecord[]
  // Only set on a fresh creation, not a resume (the original create
  // response isn't persisted anywhere to recover it later — acceptable
  // since a resumed send already had its link shown once, or is findable
  // in My Transfers).
  shareUrl?: string
}

export async function initOrResumeTransferUpload(
  projectId: string,
  file: File,
  partCount: number,
  extra: { note?: string; expiryDays?: number } = {}
): Promise<TransferUploadInit> {
  const raw = loadUploadResume(projectId, file.name, file.size, file.lastModified)
  // A batch-child pointer (see initOrResumeBatchTransfer below) is never
  // valid here — it's keyed to a different route shape entirely.
  const existing = raw && !raw.batchTransferId ? raw : null
  if (existing) {
    const statusRes = await fetchWithTimeout(
      `/studio/api/admin/projects/${projectId}/transfers/${existing.fileId}/upload-status?uploadId=${encodeURIComponent(existing.uploadId)}&partCount=${partCount}`
    ).then((r) => r.json()).catch(() => null)
    if (statusRes?.success) {
      return {
        transferId: existing.fileId,
        uploadId: existing.uploadId,
        presignedUrls: statusRes.data.presignedUrls,
        completedParts: statusRes.data.completedParts,
      }
    }
    clearUploadResume(projectId, file.name, file.size, file.lastModified)
  }

  const initRes = await fetchWithTimeout(`/studio/api/admin/projects/${projectId}/transfers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      direction: 'SEND', filename: file.name, mimeType: file.type, sizeBytes: file.size, partCount,
      ...(extra.note ? { note: extra.note } : {}),
      ...(extra.expiryDays ? { expiryDays: extra.expiryDays } : {}),
    }),
  }).then((r) => r.json())
  if (!initRes.success) throw new Error(initRes.message ?? 'Could not start upload')
  const { transferId, uploadId, presignedUrls, shareUrl } = initRes.data
  saveUploadResume({ projectId, fileId: transferId, uploadId, filename: file.name, size: file.size, lastModified: file.lastModified })
  return { transferId, uploadId, presignedUrls, completedParts: [], shareUrl }
}

export function clearTransferUploadResume(projectId: string, file: File): void {
  clearUploadResume(projectId, file.name, file.size, file.lastModified)
}

export interface BatchChildInit {
  fileId: string
  uploadId: string
  presignedUrls: string[]
  completedParts: PartRecord[]
}

export interface BatchTransferInit {
  transferId: string
  shareUrl?: string
  children: BatchChildInit[]
}

// Resume-aware batch creation for 2+ files, one shared transfer/link instead
// of N independent ones. Resume is intentionally all-or-nothing: if every
// picked file has a localStorage pointer and they all point at the *same*
// batchTransferId (the common case — re-picking the exact same folder after
// a reload), every child resumes against its existing upload; otherwise a
// fresh batch is created for the whole set. Reconciling a partial match
// (some files resumable, others new) against an existing batch is a real
// edge case this deliberately doesn't attempt — out of scope for now.
export async function initOrResumeBatchTransfer(
  projectId: string,
  pickedFiles: { file: File; relativePath: string }[],
  extra: { note?: string; expiryDays?: number } = {}
): Promise<BatchTransferInit> {
  const pointers = pickedFiles.map((p) => loadUploadResume(projectId, p.file.name, p.file.size, p.file.lastModified))
  const batchIds = new Set(pointers.filter((p) => p?.batchTransferId).map((p) => p!.batchTransferId))
  const allResumable = pointers.every((p) => !!p?.batchTransferId) && batchIds.size === 1

  if (allResumable) {
    const transferId = pointers[0]!.batchTransferId!
    const children = await Promise.all(pickedFiles.map(async (p, i) => {
      const ptr = pointers[i]!
      const partCount = Math.ceil(p.file.size / CHUNK_SIZE)
      const statusRes = await fetchWithTimeout(
        `/studio/api/admin/projects/${projectId}/transfers/${transferId}/files/${ptr.fileId}/upload-status?uploadId=${encodeURIComponent(ptr.uploadId)}&partCount=${partCount}`
      ).then((r) => r.json()).catch(() => null)
      if (!statusRes?.success) return null
      const child: BatchChildInit = {
        fileId: ptr.fileId, uploadId: ptr.uploadId,
        presignedUrls: statusRes.data.presignedUrls, completedParts: statusRes.data.completedParts,
      }
      return child
    }))
    if (children.every((c): c is BatchChildInit => c !== null)) {
      return { transferId, children }
    }
    // At least one child's resume failed (expired uploadId, etc.) — the
    // whole batch it belonged to can't be cleanly resumed piecemeal, so
    // clear every pointer and fall through to starting a fresh batch.
    pickedFiles.forEach((p) => clearUploadResume(projectId, p.file.name, p.file.size, p.file.lastModified))
  }

  const initRes = await fetchWithTimeout(`/studio/api/admin/projects/${projectId}/transfers/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: pickedFiles.map((p) => ({
        filename: p.file.name, relativePath: p.relativePath, mimeType: p.file.type,
        sizeBytes: p.file.size, partCount: Math.ceil(p.file.size / CHUNK_SIZE),
      })),
      ...(extra.note ? { note: extra.note } : {}),
      ...(extra.expiryDays ? { expiryDays: extra.expiryDays } : {}),
    }),
  }).then((r) => r.json())
  if (!initRes.success) throw new Error(initRes.message ?? 'Could not start batch upload')

  const { transferId, shareUrl, files } = initRes.data as {
    transferId: string; shareUrl: string
    files: { fileId: string; uploadId: string; presignedUrls: string[] }[]
  }
  pickedFiles.forEach((p, i) => {
    saveUploadResume({
      projectId, fileId: files[i].fileId, uploadId: files[i].uploadId,
      filename: p.file.name, size: p.file.size, lastModified: p.file.lastModified,
      batchTransferId: transferId,
    })
  })
  return { transferId, shareUrl, children: files.map((f) => ({ ...f, completedParts: [] })) }
}

export function clearBatchChildResume(projectId: string, file: File): void {
  clearUploadResume(projectId, file.name, file.size, file.lastModified)
}
