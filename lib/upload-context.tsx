'use client'

import { createContext, useContext, useState, useRef, useCallback } from 'react'
import { MULTIPART_CHUNK_SIZE_BYTES, DEFAULT_EXPIRY_DAYS } from '@/constants/pricing'
import { uploadFileInChunks, fetchWithTimeout, type PartRecord } from '@/lib/clientUpload'
import { saveUploadResume, loadUploadResume, clearUploadResume } from '@/lib/uploadResume'
import type { PriceBreakdown, FileEntry } from '@/types'

export type UploadStatus = 'uploading' | 'done' | 'failed' | 'aborted'

export interface ActiveUpload {
  id: string
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
}

interface UploadContextType {
  uploads: ActiveUpload[]
  startUpload: (
    file: File,
    pricing: PriceBreakdown,
    walletId: string,
    recipientEmails: string[],
    expiryDays?: number
  ) => string
  startBatchUpload: (
    entries: FileEntry[],
    pricing: PriceBreakdown,
    walletId: string,
    recipientEmails: string[],
    expiryDays?: number
  ) => string
  retryUpload: (id: string) => void
  abortUpload: (id: string) => Promise<void>
  minimizeUpload: (id: string) => void
  dismissUpload: (id: string) => void
}

const UploadContext = createContext<UploadContextType>({
  uploads: [],
  startUpload: () => '',
  startBatchUpload: () => '',
  retryUpload: () => {},
  abortUpload: async () => {},
  minimizeUpload: () => {},
  dismissUpload: () => {},
})

type UploadMeta = { fileId: string; uploadId: string; s3Key: string; walletId: string }
type RetryArgs = { file: File; pricing: PriceBreakdown; walletId: string; recipientEmails: string[]; expiryDays: number }
type BatchMeta = { batchId: string; walletId: string }
type BatchRetryArgs = { entries: FileEntry[]; pricing: PriceBreakdown; walletId: string; recipientEmails: string[]; expiryDays: number }
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

  const patch = useCallback((id: string, update: Partial<ActiveUpload>) => {
    setUploads(prev => prev.map(u => u.id === id ? { ...u, ...update } : u))
  }, [])

  const runUpload = useCallback(async (
    id: string,
    file: File,
    pricing: PriceBreakdown,
    walletId: string,
    recipientEmails: string[],
    expiryDays: number
  ) => {
    retryArgsRef.current.set(id, { file, pricing, walletId, recipientEmails, expiryDays })
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
    expiryDays: number
  ) => {
    batchRetryArgsRef.current.set(id, { entries, pricing, walletId, recipientEmails, expiryDays })
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

      if (abortedRef.current.has(id)) {
        await fetchWithTimeout('/api/upload/batch/abort', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId, walletId, reason: 'USER_ABANDONED' }),
        }).catch(() => {})
        batchMetaRef.current.delete(id)
        return
      }

      let shareableLink: string | null = null
      let uploadError: string | null = null

      const uploadOne = async (index: number) => {
        if (abortedRef.current.has(id) || uploadError) return
        const file = entries[index].file
        const meta = fileResults[index]
        try {
          const presignedUrls = await Promise.all(
            Array.from({ length: meta.totalChunks }, async (_, i) => {
              const res = await fetchWithTimeout('/api/upload/batch/part-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batchId, fileId: meta.fileId, uploadId: meta.uploadId, partNumber: i + 1, walletId }),
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
            (uploadedBytes) => {
              uploadedByFile[index] = uploadedBytes
              reportProgress()
            }
          )
          if (abortedRef.current.has(id)) return

          const completeRes = await fetchWithTimeout('/api/upload/batch/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batchId, fileId: meta.fileId, uploadId: meta.uploadId, parts, walletId }),
          }).then(r => r.json())
          if (!completeRes.success) throw new Error(completeRes.message ?? 'Complete failed')
          uploadedByFile[index] = file.size
          reportProgress()
        } catch (err) {
          uploadError = err instanceof Error ? err.message : 'Upload failed'
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
      if (uploadError) throw new Error(uploadError)

      const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
      shareableLink = `${appUrl}/download/${batchId}`

      batchMetaRef.current.delete(id)
      batchRetryArgsRef.current.delete(id)
      patch(id, {
        percent: 100,
        uploadedBytes: totalBytes,
        status: 'done',
        shareableLink,
      })
    } catch (err) {
      if (abortedRef.current.has(id)) return
      patch(id, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Upload failed',
      })
    }
  }, [patch])

  const startUpload = useCallback((
    file: File,
    pricing: PriceBreakdown,
    walletId: string,
    recipientEmails: string[],
    expiryDays: number = DEFAULT_EXPIRY_DAYS
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
    }])
    runUpload(id, file, pricing, walletId, recipientEmails, expiryDays)
    return id
  }, [runUpload])

  const startBatchUpload = useCallback((
    entries: FileEntry[],
    pricing: PriceBreakdown,
    walletId: string,
    recipientEmails: string[],
    expiryDays: number = DEFAULT_EXPIRY_DAYS
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
    }])
    runBatchUpload(id, entries, pricing, walletId, recipientEmails, expiryDays)
    return id
  }, [runBatchUpload])

  const retryUpload = useCallback((id: string) => {
    const batchArgs = batchRetryArgsRef.current.get(id)
    if (batchArgs) {
      abortedRef.current.delete(id)
      patch(id, { status: 'uploading', error: null })
      runBatchUpload(id, batchArgs.entries, batchArgs.pricing, batchArgs.walletId, batchArgs.recipientEmails, batchArgs.expiryDays)
      return
    }
    const args = retryArgsRef.current.get(id)
    if (!args) return
    abortedRef.current.delete(id)
    patch(id, { status: 'uploading', error: null })
    runUpload(id, args.file, args.pricing, args.walletId, args.recipientEmails, args.expiryDays)
  }, [runUpload, runBatchUpload, patch])

  const abortUpload = useCallback(async (id: string) => {
    abortedRef.current.add(id)

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
    setUploads(prev => prev.filter(u => u.id !== id))
  }, [])

  return (
    <UploadContext.Provider value={{ uploads, startUpload, startBatchUpload, retryUpload, abortUpload, minimizeUpload, dismissUpload }}>
      {children}
    </UploadContext.Provider>
  )
}

export const useUpload = () => useContext(UploadContext)
