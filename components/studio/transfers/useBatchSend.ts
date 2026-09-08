'use client'

// Orchestrates uploading N picked files with one shared progress view.
// Single file (N=1) uses today's exact single-transfer flow, unchanged.
// 2+ files create ONE real batch transfer (one shareToken/link — see
// lib/studio/rawTransferUpload.ts#initOrResumeBatchTransfer and the new
// .../transfers/batch + .../files/[fileId]/* routes) with N child files
// living inside it, not N independent transfers. Bounded concurrency
// matches VayuTransfer's own BATCH_CONCURRENCY=3; the actual chunk-level
// retry/resume is entirely lib/studio/clientUpload.ts doing what it already
// does — this hook is just the fan-out/bookkeeping on top, and a failed
// file never stops its siblings (same "no kill-switch" principle
// VayuTransfer's own batch upload follows).

import { useCallback, useRef, useState } from 'react'
import type { StudioProject } from '@/types/studio'
import { CHUNK_SIZE, uploadFileInChunks, runWithConcurrencyLimit } from '@/lib/studio/clientUpload'
import {
  initOrResumeTransferUpload, clearTransferUploadResume,
  initOrResumeBatchTransfer, clearBatchChildResume,
  type BatchChildInit,
} from '@/lib/studio/rawTransferUpload'

export interface PickedFile {
  id: string
  file: File
  relativePath: string
}

export type UploadItemStatus = 'queued' | 'uploading' | 'done' | 'failed'
export interface UploadItem {
  id: string
  file: File
  relativePath: string
  status: UploadItemStatus
  uploadedBytes: number
  error?: string
}

export interface SendExtra {
  note?: string
  expiryDays?: number
}

const BATCH_CONCURRENCY = 3

// Per-item bookkeeping needed to retry cleanly without the caller having to
// re-supply anything — batch is null for a single-file send.
interface ItemContext {
  picked: PickedFile
  targetProject: StudioProject
  extra: SendExtra
  batch: { transferId: string; child: BatchChildInit } | null
}

export function useBatchSend() {
  const [items, setItems] = useState<UploadItem[]>([])
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const abortRefs = useRef<Map<string, { abortUrl: string; uploadId: string; controller: AbortController }>>(new Map())
  const contextById = useRef<Map<string, ItemContext>>(new Map())
  const [shareUrl, setShareUrl] = useState<string | null>(null)

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)))
  }, [])

  // Single-file path — today's exact flow, byte-for-byte unchanged.
  const uploadSingle = useCallback(async (picked: PickedFile, targetProject: StudioProject, extra: SendExtra) => {
    updateItem(picked.id, { status: 'uploading', error: undefined })
    const controller = new AbortController()
    try {
      const partCount = Math.ceil(picked.file.size / CHUNK_SIZE)
      const init = await initOrResumeTransferUpload(targetProject.projectId, picked.file, partCount, extra)
      abortRefs.current.set(picked.id, {
        abortUrl: `/studio/api/admin/projects/${targetProject.projectId}/transfers/${init.transferId}/abort`,
        uploadId: init.uploadId, controller,
      })
      if (init.shareUrl) setShareUrl(init.shareUrl)

      const parts = await uploadFileInChunks(picked.file, init.presignedUrls, init.completedParts, (uploadedBytes) => {
        updateItem(picked.id, { uploadedBytes })
      }, controller.signal)

      const completeRes = await fetch(`/studio/api/admin/projects/${targetProject.projectId}/transfers/${init.transferId}/upload-complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId: init.uploadId, parts }),
      }).then(r => r.json())
      if (!completeRes.success) throw new Error(completeRes.message ?? 'Could not finish upload')

      clearTransferUploadResume(targetProject.projectId, picked.file)
      updateItem(picked.id, { status: 'done', uploadedBytes: picked.file.size })
    } catch (err) {
      const cancelled = err instanceof DOMException && err.name === 'AbortError'
      updateItem(picked.id, { status: 'failed', error: cancelled ? 'Cancelled' : err instanceof Error ? err.message : 'Upload failed' })
    } finally {
      abortRefs.current.delete(picked.id)
    }
  }, [updateItem])

  // One child within a real batch transfer.
  const uploadBatchChild = useCallback(async (
    picked: PickedFile, targetProject: StudioProject, transferId: string, child: BatchChildInit
  ) => {
    updateItem(picked.id, { status: 'uploading', error: undefined })
    const controller = new AbortController()
    abortRefs.current.set(picked.id, {
      abortUrl: `/studio/api/admin/projects/${targetProject.projectId}/transfers/${transferId}/files/${child.fileId}/abort`,
      uploadId: child.uploadId, controller,
    })
    try {
      const parts = await uploadFileInChunks(picked.file, child.presignedUrls, child.completedParts, (uploadedBytes) => {
        updateItem(picked.id, { uploadedBytes })
      }, controller.signal)

      const completeRes = await fetch(
        `/studio/api/admin/projects/${targetProject.projectId}/transfers/${transferId}/files/${child.fileId}/upload-complete`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadId: child.uploadId, parts }) }
      ).then(r => r.json())
      if (!completeRes.success) throw new Error(completeRes.message ?? 'Could not finish upload')

      clearBatchChildResume(targetProject.projectId, picked.file)
      updateItem(picked.id, { status: 'done', uploadedBytes: picked.file.size })
    } catch (err) {
      const cancelled = err instanceof DOMException && err.name === 'AbortError'
      updateItem(picked.id, { status: 'failed', error: cancelled ? 'Cancelled' : err instanceof Error ? err.message : 'Upload failed' })
    } finally {
      abortRefs.current.delete(picked.id)
    }
  }, [updateItem])

  const start = useCallback(async (pickedFiles: PickedFile[], targetProject: StudioProject, extra: SendExtra) => {
    setItems(pickedFiles.map(p => ({ id: p.id, file: p.file, relativePath: p.relativePath, status: 'queued', uploadedBytes: 0 })))
    setStartedAt(Date.now())
    setShareUrl(null)

    if (pickedFiles.length === 1) {
      const picked = pickedFiles[0]
      contextById.current.set(picked.id, { picked, targetProject, extra, batch: null })
      await uploadSingle(picked, targetProject, extra)
      return
    }

    try {
      const batchInit = await initOrResumeBatchTransfer(targetProject.projectId, pickedFiles, extra)
      if (batchInit.shareUrl) setShareUrl(batchInit.shareUrl)
      await runWithConcurrencyLimit(pickedFiles, BATCH_CONCURRENCY, async (picked, i) => {
        const child = batchInit.children[i]
        contextById.current.set(picked.id, { picked, targetProject, extra, batch: { transferId: batchInit.transferId, child } })
        await uploadBatchChild(picked, targetProject, batchInit.transferId, child)
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start batch upload'
      setItems(prev => prev.map(it => ({ ...it, status: 'failed', error: message })))
    }
  }, [uploadSingle, uploadBatchChild])

  const retry = useCallback((id: string) => {
    const ctx = contextById.current.get(id)
    if (!ctx) return
    if (ctx.batch) {
      uploadBatchChild(ctx.picked, ctx.targetProject, ctx.batch.transferId, ctx.batch.child)
    } else {
      uploadSingle(ctx.picked, ctx.targetProject, ctx.extra)
    }
  }, [uploadSingle, uploadBatchChild])

  // Aborts every still-in-flight file's multipart upload — done files stay
  // done (there's nothing to cancel about them), failed ones stay failed.
  const cancelAll = useCallback(() => {
    for (const entry of Array.from(abortRefs.current.values())) {
      entry.controller.abort()
      fetch(entry.abortUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId: entry.uploadId }),
      }).catch(() => {})
    }
  }, [])

  const reset = useCallback(() => {
    setItems([])
    setStartedAt(null)
    setShareUrl(null)
    contextById.current.clear()
    abortRefs.current.clear()
  }, [])

  return { items, startedAt, shareUrl, start, retry, cancelAll, reset }
}
