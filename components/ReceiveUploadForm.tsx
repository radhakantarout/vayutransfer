'use client'

import { useState, useRef } from 'react'
import UploadZone from '@/components/UploadZone'
import { CheckCircleIcon, ClockIcon, UploadCloudIcon } from '@/components/icons'
import { uploadFileInChunks, fetchWithTimeout } from '@/lib/clientUpload'
import FeedbackWidget from '@/components/FeedbackWidget'
import { MULTIPART_CHUNK_SIZE_BYTES, MAX_FILE_SIZE_GB } from '@/constants/pricing'
import type { FileEntry } from '@/types'

interface Props {
  requestId: string
}

type Status = 'idle' | 'uploading' | 'insufficient' | 'done' | 'error'

const MAX_TOTAL_BYTES = MAX_FILE_SIZE_GB * 1024 * 1024 * 1024
const CONCURRENCY = 3

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function ReceiveUploadForm({ requestId }: Props) {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [percent, setPercent] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const abortedRef = useRef(false)
  const batchIdRef = useRef<string | null>(null)

  const totalBytes = entries.reduce((s, e) => s + e.file.size, 0)
  const canSend = entries.length > 0 && totalBytes <= MAX_TOTAL_BYTES

  const handleSend = async () => {
    if (!canSend) return
    setStatus('uploading')
    setError(null)
    abortedRef.current = false

    const uploadedByFile = new Array(entries.length).fill(0)
    const reportProgress = () => {
      const uploaded = uploadedByFile.reduce((s, n) => s + n, 0)
      setPercent(Math.min(95, Math.round((uploaded / totalBytes) * 95)))
    }

    try {
      const initRes = await fetchWithTimeout(`/api/receive/${requestId}/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: entries.map(({ file, path }) => ({
            fileName: file.name,
            fileSizeBytes: file.size,
            relativePath: path !== file.name ? path : undefined,
            contentType: file.type || 'application/octet-stream',
          })),
        }),
      }).then((r) => r.json())

      if (!initRes.success) {
        if (initRes.error === 'INSUFFICIENT_BALANCE') {
          setStatus('insufficient')
        } else {
          setStatus('error')
          setError(initRes.message ?? 'Could not start upload')
        }
        return
      }

      const { batchId, files: fileResults } = initRes.data as {
        batchId: string
        files: { fileId: string; uploadId: string; fileName: string; fileSizeBytes: number; totalChunks: number }[]
      }
      batchIdRef.current = batchId

      let uploadError: string | null = null
      const uploadOne = async (index: number) => {
        if (abortedRef.current || uploadError) return
        const file = entries[index].file
        const meta = fileResults[index]
        try {
          const presignedUrls = await Promise.all(
            Array.from({ length: meta.totalChunks }, async (_, i) => {
              const res = await fetchWithTimeout(`/api/receive/${requestId}/part-url`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileId: meta.fileId, uploadId: meta.uploadId, partNumber: i + 1 }),
              }).then((r) => r.json())
              if (!res.success) throw new Error('Failed to get upload URL')
              return res.data.presignedUrl as string
            })
          )

          const parts = await uploadFileInChunks(
            file,
            MULTIPART_CHUNK_SIZE_BYTES,
            presignedUrls,
            [],
            () => abortedRef.current,
            (uploadedBytes) => {
              uploadedByFile[index] = uploadedBytes
              reportProgress()
            }
          )
          if (abortedRef.current) return

          const completeRes = await fetchWithTimeout(`/api/receive/${requestId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId: meta.fileId, uploadId: meta.uploadId, parts }),
          }).then((r) => r.json())
          if (!completeRes.success) throw new Error(completeRes.message ?? 'Complete failed')
          uploadedByFile[index] = file.size
          reportProgress()
        } catch (err) {
          uploadError = err instanceof Error ? err.message : 'Upload failed'
        }
      }

      let next = 0
      const workers = Array.from({ length: Math.min(CONCURRENCY, entries.length) }, async () => {
        while (next < entries.length) {
          const i = next++
          await uploadOne(i)
        }
      })
      await Promise.all(workers)

      if (abortedRef.current) return
      if (uploadError) throw new Error(uploadError)

      setPercent(100)
      setStatus('done')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  const handleCancel = async () => {
    abortedRef.current = true
    if (batchIdRef.current) {
      await fetchWithTimeout(`/api/receive/${requestId}/abort`, { method: 'POST' }).catch(() => {})
    }
    setStatus('idle')
    setPercent(0)
    setEntries([])
    batchIdRef.current = null
  }

  if (status === 'done') {
    return (
      <div className="bg-card border border-success/40 rounded-2xl p-8 text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-success/10 text-success flex items-center justify-center">
          <CheckCircleIcon className="w-7 h-7" />
        </div>
        <div className="text-success font-semibold text-lg">Sent!</div>
        <div className="text-muted text-sm">Your file{entries.length > 1 ? 's have' : ' has'} been delivered.</div>
        <div className="text-left pt-2">
          <FeedbackWidget subjectType="receiveRequest" subjectId={requestId} role="uploader" />
        </div>
      </div>
    )
  }

  if (status === 'insufficient') {
    return (
      <div className="bg-card border border-yellow-500/40 rounded-2xl p-8 text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-yellow-500/10 text-yellow-400 flex items-center justify-center">
          <ClockIcon className="w-7 h-7" />
        </div>
        <div className="text-yellow-400 font-semibold text-lg">Waiting on the sender</div>
        <div className="text-muted text-sm">
          Their wallet balance is too low right now — they&apos;ve been notified to add funds. Try again in a few minutes.
        </div>
        <button
          onClick={() => setStatus('idle')}
          className="text-accent text-sm hover:underline"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <UploadZone onFilesSelect={setEntries} entries={entries} disabled={status === 'uploading'} />

      {status === 'error' && error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {status === 'uploading' ? (
        <div className="bg-card border border-border rounded-xl p-6 space-y-3">
          <div className="w-full bg-bg rounded-full h-2 overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all duration-200" style={{ width: `${percent}%` }} />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">{formatBytes(totalBytes)} · Sending…</span>
            <span className="text-accent font-bold">{percent}%</span>
          </div>
          <button onClick={handleCancel} className="w-full text-danger text-sm hover:underline">
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="w-full bg-accent text-bg font-bold py-4 rounded-xl text-lg hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <UploadCloudIcon className="w-5 h-5" />
          {entries.length > 1 ? `Send ${entries.length} Files` : 'Send File'}
        </button>
      )}
    </div>
  )
}
