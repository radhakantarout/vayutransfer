'use client'

import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import { MULTIPART_CHUNK_SIZE_BYTES } from '@/constants/pricing'
import type { PriceBreakdown } from '@/types'

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
    recipientEmails: string[]
  ) => string
  abortUpload: (id: string) => Promise<void>
  minimizeUpload: (id: string) => void
  dismissUpload: (id: string) => void
}

const UploadContext = createContext<UploadContextType>({
  uploads: [],
  startUpload: () => '',
  abortUpload: async () => {},
  minimizeUpload: () => {},
  dismissUpload: () => {},
})

type UploadMeta = { fileId: string; uploadId: string; s3Key: string; walletId: string }

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [uploads, setUploads] = useState<ActiveUpload[]>([])
  const abortedRef = useRef<Set<string>>(new Set())
  const metaRef = useRef<Map<string, UploadMeta>>(new Map())

  // Abort all in-progress uploads when the tab closes
  useEffect(() => {
    const onUnload = () => {
      metaRef.current.forEach((meta) => {
        navigator.sendBeacon(
          '/api/upload/multipart/abort',
          JSON.stringify({ ...meta, reason: 'USER_ABANDONED' })
        )
      })
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  const patch = useCallback((id: string, update: Partial<ActiveUpload>) => {
    setUploads(prev => prev.map(u => u.id === id ? { ...u, ...update } : u))
  }, [])

  const runUpload = useCallback(async (
    id: string,
    file: File,
    pricing: PriceBreakdown,
    walletId: string,
    recipientEmails: string[]
  ) => {
    const startTime = Date.now()
    try {
      const initRes = await fetch('/api/upload/multipart/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId,
          fileName: file.name,
          fileSizeBytes: file.size,
          downloadSlots: pricing.downloadSlots,
          recipientEmails: recipientEmails.length > 0 ? recipientEmails : undefined,
          contentType: file.type || 'application/octet-stream',
        }),
      })
      const initData = await initRes.json()
      if (!initData.success) {
        patch(id, { status: 'failed', error: initData.message ?? 'Upload failed' })
        return
      }

      const { fileId, uploadId, s3Key, totalChunks } = initData.data
      metaRef.current.set(id, { fileId, uploadId, s3Key, walletId })

      // If aborted during initiation, clean up immediately
      if (abortedRef.current.has(id)) {
        try {
          await fetch('/api/upload/multipart/abort', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId, uploadId, s3Key, walletId, reason: 'USER_ABANDONED' }),
          })
        } catch {}
        metaRef.current.delete(id)
        return
      }

      const parts: { PartNumber: number; ETag: string }[] = []
      for (let i = 0; i < totalChunks; i++) {
        if (abortedRef.current.has(id)) return

        const start = i * MULTIPART_CHUNK_SIZE_BYTES
        const end = Math.min(start + MULTIPART_CHUNK_SIZE_BYTES, file.size)
        const chunk = file.slice(start, end)

        const partRes = await fetch('/api/upload/multipart/part-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId, uploadId, partNumber: i + 1, s3Key, walletId }),
        })
        const partData = await partRes.json()
        if (!partData.success) throw new Error('Failed to get upload URL')

        const putRes = await fetch(partData.data.presignedUrl, { method: 'PUT', body: chunk })
        if (!putRes.ok) throw new Error(`Part ${i + 1} upload failed`)

        const etag = putRes.headers.get('ETag')
        if (!etag) throw new Error('Missing ETag')
        parts.push({ PartNumber: i + 1, ETag: etag })

        const uploadedBytes = Math.min((i + 1) * MULTIPART_CHUNK_SIZE_BYTES, file.size)
        const elapsed = (Date.now() - startTime) / 1000
        const speed = elapsed > 0.5 ? uploadedBytes / elapsed : 0
        const secsLeft = speed > 0 ? (file.size - uploadedBytes) / speed : Infinity

        patch(id, {
          uploadedBytes,
          percent: Math.round(((i + 1) / totalChunks) * 95),
          speedBytesPerSec: speed,
          secondsRemaining: secsLeft,
        })
      }

      if (abortedRef.current.has(id)) return

      const completeRes = await fetch('/api/upload/multipart/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, uploadId, s3Key, parts, walletId }),
      })
      const completeData = await completeRes.json()
      if (!completeData.success) throw new Error(completeData.message ?? 'Complete failed')

      metaRef.current.delete(id)
      patch(id, {
        percent: 100,
        uploadedBytes: file.size,
        status: 'done',
        shareableLink: completeData.data.shareableLink,
      })
    } catch (err) {
      if (abortedRef.current.has(id)) return
      patch(id, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Upload failed',
      })
      const meta = metaRef.current.get(id)
      if (meta) {
        try {
          navigator.sendBeacon(
            '/api/upload/multipart/abort',
            JSON.stringify({ ...meta, reason: 'UPLOAD_FAILED' })
          )
        } catch {}
        metaRef.current.delete(id)
      }
    }
  }, [patch])

  const startUpload = useCallback((
    file: File,
    pricing: PriceBreakdown,
    walletId: string,
    recipientEmails: string[]
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
    runUpload(id, file, pricing, walletId, recipientEmails)
    return id
  }, [runUpload])

  const abortUpload = useCallback(async (id: string) => {
    abortedRef.current.add(id)
    const meta = metaRef.current.get(id)
    if (meta) {
      try {
        await fetch('/api/upload/multipart/abort', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...meta, reason: 'USER_ABANDONED' }),
        })
      } catch {}
      metaRef.current.delete(id)
    }
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
    <UploadContext.Provider value={{ uploads, startUpload, abortUpload, minimizeUpload, dismissUpload }}>
      {children}
    </UploadContext.Provider>
  )
}

export const useUpload = () => useContext(UploadContext)
