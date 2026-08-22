'use client'

import { createContext, useContext, useState, useRef, useCallback } from 'react'
import { MULTIPART_CHUNK_SIZE_BYTES, DEFAULT_EXPIRY_DAYS } from '@/constants/pricing'
import { uploadFileInChunks, fetchWithTimeout, type PartRecord } from '@/lib/clientUpload'
import { saveUploadResume, loadUploadResume, clearUploadResume } from '@/lib/uploadResume'
import type { PriceBreakdown, FileEntry } from '@/types'

// 'partial' — a batch finished its upload pass with 1+ files genuinely
// failed (not just mid-retry); the sender chooses per remaining failed
// file to retry it, or gives up and calls skipBatchFailedFiles to proceed
// with whatever succeeded (see finalizePartialBatch server-side).
export type UploadStatus = 'uploading' | 'done' | 'failed' | 'partial' | 'aborted'

export interface BatchFileProgress {
  fileId: string
  path: string
  sizeBytes: number
  status: 'pending' | 'uploading' | 'done' | 'failed' | 'skipped'
  retryCount: number
}

export interface ActiveUpload {
  id: string
  // The server-side Transfer's own fileId/batchId, once known (set right
  // after initiate returns — well before completion, unlike shareableLink
  // which only exists once done). Lets other pages (e.g. /transfers) match
  // a pending Transfer record back to this in-progress upload to deep-link
  // into its live step-4 progress view.
  transferId?: string
  fileName: string
  totalBytes: number
  uploadedBytes: number
  percent: number
  speedBytesPerSec: number
  secondsRemaining: number
  status: UploadStatus
  shareableLink: string | null
  error: string | null
  minimized: boolean
  // Client-side timestamp (Date.now()), used only to group the Uploads
  // Panel by day — never sent to the server.
  createdAt: number
  // Only set for batch uploads — per-file status backing the "partial
  // success" retry/skip UI. Absent for single-file and Drive-import
  // uploads, which have no per-file breakdown to show.
  batchFiles?: BatchFileProgress[]
}

interface UploadContextType {
  uploads: ActiveUpload[]
  startUpload: (
    file: File,
    pricing: PriceBreakdown,
    walletId: string,
    recipientEmails: string[],
    expiryDays?: number,
    message?: string,
    senderNotifyEmail?: string,
    transferTitle?: string
  ) => string
  startBatchUpload: (
    entries: FileEntry[],
    pricing: PriceBreakdown,
    walletId: string,
    recipientEmails: string[],
    expiryDays?: number,
    message?: string,
    senderNotifyEmail?: string,
    transferTitle?: string
  ) => string
  // Google Drive import — bytes never pass through the browser, so unlike
  // the two above this has no File/FileEntry to chunk. `items` are the ids
  // Google Picker returned; the server re-resolves real metadata from
  // Drive itself before spending anything. displayName/totalBytes are only
  // for the progress card's label — the server is the source of truth for
  // what actually gets billed. Progress is stage-based (poll, not byte
  // events) since Drive doesn't cheaply expose per-byte download progress.
  // (transferTitle is a separate concept — the Transfer's own title field,
  // distinct from this displayName progress-card label.)
  startDriveImport: (
    items: { id: string; mimeType: string }[],
    displayName: string,
    totalBytes: number,
    walletId: string,
    recipientEmails: string[],
    expiryDays?: number,
    message?: string,
    senderNotifyEmail?: string,
    transferTitle?: string
  ) => string
  retryUpload: (id: string) => void
  // Batch-only — retries exactly one still-failed file within a 'partial'
  // batch, leaving every other file (already uploaded or still pending
  // retry) untouched.
  retryBatchFile: (id: string, fileId: string) => void
  // Batch-only — bulk convenience wrapper that calls retryBatchFile for
  // every currently-failed file at once.
  retryAllFailedBatchFiles: (id: string) => void
  // Batch-only — gives up on every currently-failed file in a 'partial'
  // batch, refunds their share, and activates the link with whatever
  // succeeded.
  skipBatchFailedFiles: (id: string) => Promise<void>
  abortUpload: (id: string) => Promise<void>
  minimizeUpload: (id: string) => void
  dismissUpload: (id: string) => void
}

const UploadContext = createContext<UploadContextType>({
  uploads: [],
  startUpload: () => '',
  startBatchUpload: () => '',
  startDriveImport: () => '',
  retryUpload: () => {},
  retryBatchFile: () => {},
  retryAllFailedBatchFiles: () => {},
  skipBatchFailedFiles: async () => {},
  abortUpload: async () => {},
  minimizeUpload: () => {},
  dismissUpload: () => {},
})

type UploadMeta = { fileId: string; uploadId: string; s3Key: string; walletId: string }
type RetryArgs = { file: File; pricing: PriceBreakdown; walletId: string; recipientEmails: string[]; expiryDays: number; message?: string; senderNotifyEmail?: string; transferTitle?: string }
type BatchMeta = { batchId: string; walletId: string }
type BatchRetryArgs = { entries: FileEntry[]; pricing: PriceBreakdown; walletId: string; recipientEmails: string[]; expiryDays: number; message?: string; senderNotifyEmail?: string; transferTitle?: string }
type DriveMeta = { batchId: string; walletId: string }
type DriveRetryArgs = { items: { id: string; mimeType: string }[]; displayName: string; totalBytes: number; walletId: string; recipientEmails: string[]; expiryDays: number; message?: string; senderNotifyEmail?: string; transferTitle?: string }
// How many files upload in parallel within one batch — unbounded concurrency
// on a large multi-file selection is what caused the VayuStudios bulk-upload
// stall (see memory: bulk_upload_reliability_fix); keep this modest.
const BATCH_CONCURRENCY = 3

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [uploads, setUploads] = useState<ActiveUpload[]>([])
  const abortedRef = useRef<Set<string>>(new Set())
  const metaRef = useRef<Map<string, UploadMeta>>(new Map())
  // Kept so a "Retry" click (same tab, upload still in memory) can re-run
  // without the user having to re-select the file — resume-from-disk (a
  // fresh page load) still requires re-selecting the same file, since a
  // File object itself can't survive a refresh.
  const retryArgsRef = useRef<Map<string, RetryArgs>>(new Map())
  const batchMetaRef = useRef<Map<string, BatchMeta>>(new Map())
  const batchRetryArgsRef = useRef<Map<string, BatchRetryArgs>>(new Map())
  // Per-file server identifiers from the batch's initiate response — kept
  // so retryBatchFile can re-run just one file (needs its uploadId/fileId/
  // totalChunks) without re-initiating the whole batch.
  const batchFileResultsRef = useRef<Map<string, { fileId: string; uploadId: string; fileName: string; fileSizeBytes: number; totalChunks: number }[]>>(new Map())
  const driveMetaRef = useRef<Map<string, DriveMeta>>(new Map())
  const driveRetryArgsRef = useRef<Map<string, DriveRetryArgs>>(new Map())
  // Generation counter per upload id — guards a Drive-import poll loop
  // against continuing to patch state after abort/dismiss superseded it,
  // same pattern used by the zip-download poll loop in DownloadCard.tsx.
  const drivePollGenRef = useRef<Map<string, number>>(new Map())

  const patch = useCallback((id: string, update: Partial<ActiveUpload>) => {
    setUploads(prev => prev.map(u => u.id === id ? { ...u, ...update } : u))
  }, [])

  const updateBatchFileStatus = useCallback((
    id: string,
    fileId: string,
    status: BatchFileProgress['status'],
    bumpRetry = false
  ) => {
    setUploads(prev => prev.map(u => {
      if (u.id !== id || !u.batchFiles) return u
      return {
        ...u,
        batchFiles: u.batchFiles.map(bf => bf.fileId === fileId
          ? { ...bf, status, retryCount: bumpRetry ? bf.retryCount + 1 : bf.retryCount }
          : bf),
      }
    }))
  }, [])

  // Uploads one file's parts to R2/S3 and completes the multipart upload —
  // shared by runBatchUpload's initial pool and retryBatchFile's single-file
  // re-run, so the chunk-upload/complete logic exists in exactly one place.
  const uploadOneBatchFile = useCallback(async (
    id: string,
    batchId: string,
    walletId: string,
    file: File,
    fileResult: { fileId: string; uploadId: string; totalChunks: number },
    onProgress?: (uploadedBytes: number) => void
  ): Promise<{ success: boolean; batchComplete: boolean }> => {
    try {
      const presignedUrls = await Promise.all(
        Array.from({ length: fileResult.totalChunks }, async (_, i) => {
          const res = await fetchWithTimeout('/api/upload/batch/part-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batchId, fileId: fileResult.fileId, uploadId: fileResult.uploadId, partNumber: i + 1, walletId }),
          }).then(r => r.json())
          if (!res.success) throw new Error('Failed to get upload URL')
          return res.data.presignedUrl as string
        })
      )

      const parts = await uploadFileInChunks(
        file,
        MULTIPART_CHUNK_SIZE_BYTES,
        presignedUrls,
        [],
        () => abortedRef.current.has(id),
        onProgress ?? (() => {})
      )
      if (abortedRef.current.has(id)) return { success: false, batchComplete: false }

      const completeRes = await fetchWithTimeout('/api/upload/batch/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, fileId: fileResult.fileId, uploadId: fileResult.uploadId, parts, walletId }),
      }).then(r => r.json())
      if (!completeRes.success) throw new Error(completeRes.message ?? 'Complete failed')
      return { success: true, batchComplete: !!completeRes.data.batchComplete }
    } catch {
      return { success: false, batchComplete: false }
    }
  }, [])

  const runUpload = useCallback(async (
    id: string,
    file: File,
    pricing: PriceBreakdown,
    walletId: string,
    recipientEmails: string[],
    expiryDays: number,
    message?: string,
    senderNotifyEmail?: string,
    transferTitle?: string
  ) => {
    retryArgsRef.current.set(id, { file, pricing, walletId, recipientEmails, expiryDays, message, senderNotifyEmail, transferTitle })
    const startTime = Date.now()
    const totalChunks = Math.ceil(file.size / MULTIPART_CHUNK_SIZE_BYTES)

    try {
      let fileId = '', uploadId = '', s3Key = ''
      let presignedUrls: string[] = []
      let completedParts: PartRecord[] = []

      // Resume path — same file re-selected (matched by name+size+lastModified),
      // and the server still has a live multipart upload for it.
      const resumeEntry = loadUploadResume(walletId, file.name, file.size, file.lastModified)
      let resumed = false
      if (resumeEntry) {
        const statusRes = await fetchWithTimeout(
          `/api/upload/multipart/${resumeEntry.fileId}/upload-status?uploadId=${encodeURIComponent(resumeEntry.uploadId)}&partCount=${totalChunks}&walletId=${encodeURIComponent(walletId)}`
        ).then(r => r.json()).catch(() => null)

        if (statusRes?.success) {
          fileId = resumeEntry.fileId
          uploadId = resumeEntry.uploadId
          s3Key = resumeEntry.fileId // unused beyond echoing back — real key resolved server-side
          presignedUrls = statusRes.data.presignedUrls
          completedParts = statusRes.data.completedParts
          resumed = true
        } else {
          // Can't resume (expired/completed/not found) — clear the stale
          // entry and fall through to a fresh upload below.
          clearUploadResume(walletId, file.name, file.size, file.lastModified)
        }
      }

      if (!resumed) {
        const initRes = await fetchWithTimeout('/api/upload/multipart/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletId,
            fileName: file.name,
            fileSizeBytes: file.size,
            recipientEmails: recipientEmails.length > 0 ? recipientEmails : undefined,
            message,
            senderNotifyEmail,
            displayName: transferTitle,
            contentType: file.type || 'application/octet-stream',
            expiryDays,
          }),
        }).then(r => r.json())

        if (!initRes.success) {
          patch(id, { status: 'failed', error: initRes.message ?? 'Upload failed' })
          return
        }

        fileId = initRes.data.fileId
        uploadId = initRes.data.uploadId
        s3Key = initRes.data.s3Key
        presignedUrls = []

        saveUploadResume({ fileId, uploadId, walletId, filename: file.name, size: file.size, lastModified: file.lastModified })
      }

      metaRef.current.set(id, { fileId, uploadId, s3Key, walletId })
      patch(id, { transferId: fileId })

      // If aborted during initiation/resume-check, clean up immediately
      if (abortedRef.current.has(id)) {
        try {
          await fetchWithTimeout('/api/upload/multipart/abort', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId, uploadId, s3Key, walletId, reason: 'USER_ABANDONED' }),
          })
        } catch {}
        clearUploadResume(walletId, file.name, file.size, file.lastModified)
        metaRef.current.delete(id)
        return
      }

      // Fresh (non-resumed) uploads need one presigned URL per part, fetched
      // lazily as we go (mirrors the original per-part flow) — resumed
      // uploads already got every URL up front from upload-status.
      if (!resumed) {
        presignedUrls = await Promise.all(
          Array.from({ length: totalChunks }, async (_, i) => {
            const res = await fetchWithTimeout('/api/upload/multipart/part-url', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileId, uploadId, partNumber: i + 1, s3Key, walletId }),
            }).then(r => r.json())
            if (!res.success) throw new Error('Failed to get upload URL')
            return res.data.presignedUrl as string
          })
        )
      }

      const parts = await uploadFileInChunks(
        file,
        MULTIPART_CHUNK_SIZE_BYTES,
        presignedUrls,
        completedParts,
        () => abortedRef.current.has(id),
        (uploadedBytes, partsDone) => {
          const elapsed = (Date.now() - startTime) / 1000
          const speed = elapsed > 0.5 ? uploadedBytes / elapsed : 0
          const secsLeft = speed > 0 ? (file.size - uploadedBytes) / speed : Infinity
          patch(id, {
            uploadedBytes,
            percent: Math.round((partsDone / totalChunks) * 95),
            speedBytesPerSec: speed,
            secondsRemaining: secsLeft,
          })
        }
      )

      if (abortedRef.current.has(id)) return

      const completeRes = await fetchWithTimeout('/api/upload/multipart/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, uploadId, s3Key, parts, walletId }),
      }).then(r => r.json())
      if (!completeRes.success) throw new Error(completeRes.message ?? 'Complete failed')

      clearUploadResume(walletId, file.name, file.size, file.lastModified)
      metaRef.current.delete(id)
      retryArgsRef.current.delete(id)
      patch(id, {
        percent: 100,
        uploadedBytes: file.size,
        status: 'done',
        shareableLink: completeRes.data.shareableLink,
      })
    } catch (err) {
      if (abortedRef.current.has(id)) return
      // Deliberately does NOT abort/refund on a transient failure — the
      // multipart upload (and the wallet deduction backing it) stays alive
      // so "Retry" or re-selecting the same file later can resume from
      // wherever it left off. Only an explicit user cancel aborts+refunds.
      patch(id, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Upload failed',
      })
    }
  }, [patch])

  // Batch/multi-file upload — one link, one wallet deduction, N raw files
  // (no client-side zipping). Progress is the aggregate byte count across
  // every file; a bounded pool of BATCH_CONCURRENCY files upload at once.
  const runBatchUpload = useCallback(async (
    id: string,
    entries: FileEntry[],
    pricing: PriceBreakdown,
    walletId: string,
    recipientEmails: string[],
    expiryDays: number,
    message?: string,
    senderNotifyEmail?: string,
    transferTitle?: string
  ) => {
    batchRetryArgsRef.current.set(id, { entries, pricing, walletId, recipientEmails, expiryDays, message, senderNotifyEmail, transferTitle })
    const startTime = Date.now()
    const totalBytes = entries.reduce((s, e) => s + e.file.size, 0)
    const uploadedByFile = new Array(entries.length).fill(0)
    const reportProgress = () => {
      const uploadedBytes = uploadedByFile.reduce((s, n) => s + n, 0)
      const elapsed = (Date.now() - startTime) / 1000
      const speed = elapsed > 0.5 ? uploadedBytes / elapsed : 0
      const secsLeft = speed > 0 ? (totalBytes - uploadedBytes) / speed : Infinity
      patch(id, {
        uploadedBytes,
        percent: Math.min(95, Math.round((uploadedBytes / totalBytes) * 95)),
        speedBytesPerSec: speed,
        secondsRemaining: secsLeft,
      })
    }

    try {
      const initRes = await fetchWithTimeout('/api/upload/batch/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId,
          files: entries.map(({ file, path }) => ({
            fileName: file.name,
            fileSizeBytes: file.size,
            relativePath: path !== file.name ? path : undefined,
            contentType: file.type || 'application/octet-stream',
          })),
          recipientEmails: recipientEmails.length > 0 ? recipientEmails : undefined,
          message,
          senderNotifyEmail,
          displayName: transferTitle,
          expiryDays,
        }),
      }).then(r => r.json())

      if (!initRes.success) {
        patch(id, { status: 'failed', error: initRes.message ?? 'Upload failed' })
        return
      }

      const { batchId, files: fileResults } = initRes.data as {
        batchId: string
        files: { fileId: string; uploadId: string; fileName: string; fileSizeBytes: number; totalChunks: number }[]
      }
      batchMetaRef.current.set(id, { batchId, walletId })
      batchFileResultsRef.current.set(id, fileResults)

      if (abortedRef.current.has(id)) {
        await fetchWithTimeout('/api/upload/batch/abort', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId, walletId, reason: 'USER_ABANDONED' }),
        }).catch(() => {})
        batchMetaRef.current.delete(id)
        batchFileResultsRef.current.delete(id)
        return
      }

      patch(id, {
        transferId: batchId,
        batchFiles: fileResults.map((f, i) => ({
          fileId: f.fileId,
          path: entries[i].path,
          sizeBytes: f.fileSizeBytes,
          status: 'pending',
          retryCount: 0,
        })),
      })

      // Each file's own outcome is tracked independently (updateBatchFileStatus)
      // instead of one shared kill-switch that used to abort every other
      // in-flight file the moment any single one failed — a batch with 8/10
      // files succeeding should let the sender decide (retry the 2, or Skip
      // and proceed with 8), not silently discard the 8 that already worked.
      let anyFailed = false
      let batchCompleteFromServer = false

      const uploadOne = async (index: number) => {
        if (abortedRef.current.has(id)) return
        const file = entries[index].file
        const meta = fileResults[index]
        updateBatchFileStatus(id, meta.fileId, 'uploading')
        const result = await uploadOneBatchFile(id, batchId, walletId, file, meta, (uploadedBytes) => {
          uploadedByFile[index] = uploadedBytes
          reportProgress()
        })
        if (abortedRef.current.has(id)) return
        if (result.success) {
          uploadedByFile[index] = file.size
          reportProgress()
          updateBatchFileStatus(id, meta.fileId, 'done')
          if (result.batchComplete) batchCompleteFromServer = true
        } else {
          anyFailed = true
          updateBatchFileStatus(id, meta.fileId, 'failed')
        }
      }

      // Bounded-concurrency pool over all files in the batch
      let next = 0
      const workers = Array.from({ length: Math.min(BATCH_CONCURRENCY, entries.length) }, async () => {
        while (next < entries.length) {
          const i = next++
          await uploadOne(i)
        }
      })
      await Promise.all(workers)

      if (abortedRef.current.has(id)) return

      if (batchCompleteFromServer) {
        const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
        batchMetaRef.current.delete(id)
        batchRetryArgsRef.current.delete(id)
        batchFileResultsRef.current.delete(id)
        patch(id, {
          percent: 100,
          uploadedBytes: totalBytes,
          status: 'done',
          shareableLink: `${appUrl}/download/${batchId}`,
        })
        return
      }

      if (anyFailed) {
        // Stays 'partial' — batchMetaRef/batchRetryArgsRef/batchFileResultsRef
        // are deliberately kept alive here (not cleared) so retryBatchFile
        // and skipBatchFailedFiles can still act on this upload.
        patch(id, { status: 'partial' })
        return
      }

      // Every file reported success but the server never told us the batch
      // was complete — shouldn't happen given finalizeBatchIfComplete's own
      // logic, but fail loudly rather than leave the UI stuck in 'uploading'.
      patch(id, { status: 'failed', error: 'Upload did not complete — please retry' })
    } catch (err) {
      if (abortedRef.current.has(id)) return
      patch(id, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Upload failed',
      })
    }
  }, [patch, updateBatchFileStatus, uploadOneBatchFile])

  // Retries exactly one still-failed file within a 'partial' batch.
  const retryBatchFile = useCallback((id: string, fileId: string) => {
    const args = batchRetryArgsRef.current.get(id)
    const fileResults = batchFileResultsRef.current.get(id)
    const meta = batchMetaRef.current.get(id)
    if (!args || !fileResults || !meta) return
    const index = fileResults.findIndex((f) => f.fileId === fileId)
    if (index === -1) return

    updateBatchFileStatus(id, fileId, 'uploading', true)
    const file = args.entries[index].file
    uploadOneBatchFile(id, meta.batchId, meta.walletId, file, fileResults[index]).then((result) => {
      if (abortedRef.current.has(id)) return
      if (!result.success) {
        updateBatchFileStatus(id, fileId, 'failed')
        return
      }
      updateBatchFileStatus(id, fileId, 'done')
      if (result.batchComplete) {
        const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
        batchMetaRef.current.delete(id)
        batchRetryArgsRef.current.delete(id)
        batchFileResultsRef.current.delete(id)
        patch(id, { status: 'done', percent: 100, shareableLink: `${appUrl}/download/${meta.batchId}` })
      }
    })
  }, [patch, updateBatchFileStatus, uploadOneBatchFile])

  // Retries every currently-failed file in a 'partial' batch at once — a
  // bulk convenience wrapper around retryBatchFile (same per-file mechanism,
  // just looped), not a separate upload path.
  const retryAllFailedBatchFiles = useCallback((id: string) => {
    const upload = uploads.find((u) => u.id === id)
    const failedFileIds = (upload?.batchFiles ?? []).filter((f) => f.status === 'failed').map((f) => f.fileId)
    failedFileIds.forEach((fileId) => retryBatchFile(id, fileId))
  }, [uploads, retryBatchFile])

  // Gives up on every currently-failed file in a 'partial' batch, refunds
  // their share via the server, and activates the link with whatever
  // succeeded. Reads current batchFiles from `uploads` state (not a ref)
  // since it needs the live set of failed fileIds at click time.
  const skipBatchFailedFiles = useCallback(async (id: string) => {
    const meta = batchMetaRef.current.get(id)
    if (!meta) return
    const upload = uploads.find((u) => u.id === id)
    const failedFileIds = (upload?.batchFiles ?? []).filter((f) => f.status === 'failed').map((f) => f.fileId)
    if (failedFileIds.length === 0) return

    try {
      const res = await fetchWithTimeout('/api/upload/batch/finalize-partial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: meta.batchId, walletId: meta.walletId, skipFileIds: failedFileIds }),
      }).then(r => r.json())

      if (!res.success) {
        patch(id, { error: res.message ?? 'Could not finish the transfer' })
        return
      }

      setUploads(prev => prev.map(u => u.id === id
        ? { ...u, batchFiles: u.batchFiles?.map(f => failedFileIds.includes(f.fileId) ? { ...f, status: 'skipped' as const } : f) }
        : u))

      if (res.data.batchComplete) {
        const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
        batchMetaRef.current.delete(id)
        batchRetryArgsRef.current.delete(id)
        batchFileResultsRef.current.delete(id)
        patch(id, { status: 'done', percent: 100, shareableLink: `${appUrl}/download/${meta.batchId}` })
      }
    } catch {
      patch(id, { error: 'Network error — please try again' })
    }
  }, [uploads, patch])

  // Google Drive import — no bytes to chunk from the browser, so this is a
  // start-then-poll loop instead of runUpload/runBatchUpload's chunk loop.
  // The server does the real work (lambda/vayu-drive-import streams Drive
  // → R2 directly); this just starts the job and reflects its progress
  // into the same ActiveUpload shape the upload tray already renders.
  const runDriveImport = useCallback(async (
    id: string,
    items: { id: string; mimeType: string }[],
    displayName: string,
    totalBytes: number,
    walletId: string,
    recipientEmails: string[],
    expiryDays: number,
    message?: string,
    senderNotifyEmail?: string,
    transferTitle?: string
  ) => {
    driveRetryArgsRef.current.set(id, { items, displayName, totalBytes, walletId, recipientEmails, expiryDays, message, senderNotifyEmail, transferTitle })
    const myGen = (drivePollGenRef.current.get(id) ?? 0) + 1
    drivePollGenRef.current.set(id, myGen)

    try {
      const initRes = await fetchWithTimeout('/api/google-drive/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          recipientEmails: recipientEmails.length > 0 ? recipientEmails : undefined,
          message,
          senderNotifyEmail,
          displayName: transferTitle,
          expiryDays,
        }),
      }).then(r => r.json())

      if (drivePollGenRef.current.get(id) !== myGen) return
      if (!initRes.success) {
        patch(id, { status: 'failed', error: initRes.message ?? 'Import failed' })
        return
      }

      const { batchId, jobId } = initRes.data as { batchId: string; jobId: string }
      driveMetaRef.current.set(id, { batchId, walletId })
      patch(id, { transferId: batchId })

      if (abortedRef.current.has(id)) return

      while (drivePollGenRef.current.get(id) === myGen) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        if (drivePollGenRef.current.get(id) !== myGen) return

        const statusRes = await fetchWithTimeout(`/api/google-drive/import/status/${jobId}`).then(r => r.json())
        if (drivePollGenRef.current.get(id) !== myGen) return
        if (!statusRes.success) throw new Error('Lost track of the import job')

        const s = statusRes.data as { status: string; processed: number; total: number; currentFileName?: string; errorMessage?: string }

        if (s.status === 'ready') {
          const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
          driveMetaRef.current.delete(id)
          driveRetryArgsRef.current.delete(id)
          patch(id, {
            percent: 100,
            uploadedBytes: totalBytes,
            status: 'done',
            shareableLink: `${appUrl}/download/${batchId}`,
          })
          return
        }
        if (s.status === 'failed') {
          throw new Error(s.errorMessage ?? 'Import failed')
        }
        const pct = s.total > 0 ? Math.round((s.processed / s.total) * 95) : 0
        patch(id, {
          percent: pct,
          uploadedBytes: Math.round((pct / 100) * totalBytes),
          fileName: s.currentFileName ? `Importing "${s.currentFileName}"…` : displayName,
        })
      }
    } catch (err) {
      if (drivePollGenRef.current.get(id) !== myGen) return
      patch(id, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Import failed',
      })
    }
  }, [patch])

  const startUpload = useCallback((
    file: File,
    pricing: PriceBreakdown,
    walletId: string,
    recipientEmails: string[],
    expiryDays: number = DEFAULT_EXPIRY_DAYS,
    message?: string,
    senderNotifyEmail?: string,
    transferTitle?: string
  ): string => {
    const id = crypto.randomUUID()
    setUploads(prev => [...prev, {
      id,
      fileName: file.name,
      totalBytes: file.size,
      uploadedBytes: 0,
      percent: 0,
      speedBytesPerSec: 0,
      secondsRemaining: Infinity,
      status: 'uploading',
      shareableLink: null,
      error: null,
      minimized: false,
      createdAt: Date.now(),
    }])
    runUpload(id, file, pricing, walletId, recipientEmails, expiryDays, message, senderNotifyEmail, transferTitle)
    return id
  }, [runUpload])

  const startBatchUpload = useCallback((
    entries: FileEntry[],
    pricing: PriceBreakdown,
    walletId: string,
    recipientEmails: string[],
    expiryDays: number = DEFAULT_EXPIRY_DAYS,
    message?: string,
    senderNotifyEmail?: string,
    transferTitle?: string
  ): string => {
    const id = crypto.randomUUID()
    const totalBytes = entries.reduce((s, e) => s + e.file.size, 0)
    setUploads(prev => [...prev, {
      id,
      fileName: entries.length === 1 ? entries[0].file.name : `${entries.length} files`,
      totalBytes,
      uploadedBytes: 0,
      percent: 0,
      speedBytesPerSec: 0,
      secondsRemaining: Infinity,
      status: 'uploading',
      shareableLink: null,
      error: null,
      minimized: false,
      createdAt: Date.now(),
    }])
    runBatchUpload(id, entries, pricing, walletId, recipientEmails, expiryDays, message, senderNotifyEmail, transferTitle)
    return id
  }, [runBatchUpload])

  const startDriveImport = useCallback((
    items: { id: string; mimeType: string }[],
    displayName: string,
    totalBytes: number,
    walletId: string,
    recipientEmails: string[],
    expiryDays: number = DEFAULT_EXPIRY_DAYS,
    message?: string,
    senderNotifyEmail?: string,
    transferTitle?: string
  ): string => {
    const id = crypto.randomUUID()
    setUploads(prev => [...prev, {
      id,
      fileName: `Importing from Google Drive — ${displayName}`,
      totalBytes,
      uploadedBytes: 0,
      percent: 0,
      speedBytesPerSec: 0,
      secondsRemaining: Infinity,
      status: 'uploading',
      shareableLink: null,
      error: null,
      minimized: false,
      createdAt: Date.now(),
    }])
    runDriveImport(id, items, displayName, totalBytes, walletId, recipientEmails, expiryDays, message, senderNotifyEmail, transferTitle)
    return id
  }, [runDriveImport])

  const retryUpload = useCallback((id: string) => {
    const driveArgs = driveRetryArgsRef.current.get(id)
    if (driveArgs) {
      abortedRef.current.delete(id)
      patch(id, { status: 'uploading', error: null })
      runDriveImport(id, driveArgs.items, driveArgs.displayName, driveArgs.totalBytes, driveArgs.walletId, driveArgs.recipientEmails, driveArgs.expiryDays, driveArgs.message, driveArgs.senderNotifyEmail, driveArgs.transferTitle)
      return
    }
    const batchArgs = batchRetryArgsRef.current.get(id)
    if (batchArgs) {
      abortedRef.current.delete(id)
      patch(id, { status: 'uploading', error: null })
      runBatchUpload(id, batchArgs.entries, batchArgs.pricing, batchArgs.walletId, batchArgs.recipientEmails, batchArgs.expiryDays, batchArgs.message, batchArgs.senderNotifyEmail, batchArgs.transferTitle)
      return
    }
    const args = retryArgsRef.current.get(id)
    if (!args) return
    abortedRef.current.delete(id)
    patch(id, { status: 'uploading', error: null })
    runUpload(id, args.file, args.pricing, args.walletId, args.recipientEmails, args.expiryDays, args.message, args.senderNotifyEmail, args.transferTitle)
  }, [runUpload, runBatchUpload, runDriveImport, patch])

  const abortUpload = useCallback(async (id: string) => {
    abortedRef.current.add(id)
    // Bump the poll generation so a Drive-import poll loop in flight for
    // this id stops on its next check, even before the abort route call
    // below resolves.
    drivePollGenRef.current.set(id, (drivePollGenRef.current.get(id) ?? 0) + 1)

    const driveMeta = driveMetaRef.current.get(id)
    if (driveMeta) {
      try {
        await fetchWithTimeout('/api/google-drive/import/abort', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId: driveMeta.batchId, walletId: driveMeta.walletId }),
        })
      } catch {}
      driveMetaRef.current.delete(id)
      driveRetryArgsRef.current.delete(id)
      setUploads(prev => prev.filter(u => u.id !== id))
      abortedRef.current.delete(id)
      return
    }

    const batchMeta = batchMetaRef.current.get(id)
    if (batchMeta) {
      try {
        await fetchWithTimeout('/api/upload/batch/abort', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId: batchMeta.batchId, walletId: batchMeta.walletId, reason: 'USER_ABANDONED' }),
        })
      } catch {}
      batchMetaRef.current.delete(id)
      batchRetryArgsRef.current.delete(id)
      setUploads(prev => prev.filter(u => u.id !== id))
      abortedRef.current.delete(id)
      return
    }

    const meta = metaRef.current.get(id)
    const args = retryArgsRef.current.get(id)
    if (meta) {
      try {
        await fetchWithTimeout('/api/upload/multipart/abort', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...meta, reason: 'USER_ABANDONED' }),
        })
      } catch {}
      if (args) clearUploadResume(meta.walletId, args.file.name, args.file.size, args.file.lastModified)
      metaRef.current.delete(id)
    }
    retryArgsRef.current.delete(id)
    setUploads(prev => prev.filter(u => u.id !== id))
    abortedRef.current.delete(id)
  }, [])

  const minimizeUpload = useCallback((id: string) => {
    patch(id, { minimized: true })
  }, [patch])

  const dismissUpload = useCallback((id: string) => {
    // A dismissed-without-retrying failed upload must release everything
    // retryArgsRef/batchRetryArgsRef were keeping alive for a possible Retry
    // — including the actual File object(s), which for a batch means every
    // selected file in that folder/multi-file upload. abortUpload already
    // does this same cleanup; dismiss (used for done/failed cards, no abort
    // call involved) needs its own copy of it.
    metaRef.current.delete(id)
    retryArgsRef.current.delete(id)
    batchMetaRef.current.delete(id)
    batchRetryArgsRef.current.delete(id)
    driveMetaRef.current.delete(id)
    driveRetryArgsRef.current.delete(id)
    drivePollGenRef.current.delete(id)
    setUploads(prev => prev.filter(u => u.id !== id))
  }, [])

  return (
    <UploadContext.Provider value={{ uploads, startUpload, startBatchUpload, startDriveImport, retryUpload, retryBatchFile, retryAllFailedBatchFiles, skipBatchFailedFiles, abortUpload, minimizeUpload, dismissUpload }}>
      {children}
    </UploadContext.Provider>
  )
}

export const useUpload = () => useContext(UploadContext)
