'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useWallet } from '@/lib/wallet-context'
import { useUpload } from '@/lib/upload-context'
import { fetchWithTimeout, uploadFileInChunks } from '@/lib/clientUpload'
import { calculatePrice } from '@/lib/pricing'
import { MULTIPART_CHUNK_SIZE_BYTES, DEFAULT_EXPIRY_DAYS } from '@/constants/pricing'
import { FileTypeIcon, PackageIcon, CheckCircleIcon, AlertCircleIcon, UploadCloudIcon } from '@/components/icons'
import type { ResumeInfoFile } from '@/app/api/transfers/[fileId]/resume-info/route'

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

type RowState = 'missing' | 'matched' | 'uploading' | 'done' | 'error'

export default function ResumeTransferPage({ params }: { params: { fileId: string } }) {
  const { fileId } = params
  const router = useRouter()
  const { status: sessionStatus } = useSession()
  const { walletId } = useWallet()
  const { startUpload } = useUpload()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [transferStatus, setTransferStatus] = useState<string | null>(null)
  const [fileCount, setFileCount] = useState<number | undefined>(undefined)
  const [files, setFiles] = useState<ResumeInfoFile[]>([])
  const [rowState, setRowState] = useState<Record<string, RowState>>({})
  const [matchedFiles, setMatchedFiles] = useState<Map<string, File>>(new Map())
  const [uploading, setUploading] = useState(false)
  const [skipping, setSkipping] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [singleFileResuming, setSingleFileResuming] = useState(false)
  const abortedRef = useRef(false)

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') router.replace('/login')
  }, [sessionStatus, router])

  const load = () => {
    setLoading(true)
    setLoadError(null)
    fetch(`/api/transfers/${fileId}/resume-info`)
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) { setLoadError(res.message ?? 'Could not load this transfer'); return }
        setTransferStatus(res.data.status)
        setFileCount(res.data.fileCount)
        setFiles(res.data.files)
        setRowState((prev) => {
          const next = { ...prev }
          for (const f of res.data.files as ResumeInfoFile[]) {
            if (f.status !== 'pending') next[f.fileId] = 'done'
            else if (!next[f.fileId] || next[f.fileId] === 'done') next[f.fileId] = 'missing'
          }
          return next
        })
      })
      .catch(() => setLoadError('Network error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [fileId]) // eslint-disable-line react-hooks/exhaustive-deps

  const isBatch = !!fileCount
  const missing = files.filter((f) => f.status === 'pending')
  const uploadedCount = files.filter((f) => f.status !== 'pending').length

  // ── Batch resume ──────────────────────────────────────────────────────
  // Deliberately self-contained here rather than routed through the global
  // upload-context — the resume page already knows the exact batchId and
  // exact missing files from the server (resume-info), so there's no need
  // to touch runBatchUpload's localStorage-matching machinery, which is
  // built around "maybe this file matches some past attempt," not "resume
  // this specific known batch."
  const onFolderSelected = (fileList: FileList) => {
    const next = new Map(matchedFiles)
    const nextRowState = { ...rowState }
    Array.from(fileList).forEach((file) => {
      const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
      const hit = missing.find((f) => (f.relativePath || f.fileName) === path && f.fileSizeBytes === file.size)
      if (hit) {
        next.set(hit.fileId, file)
        nextRowState[hit.fileId] = 'matched'
      }
    })
    setMatchedFiles(next)
    setRowState(nextRowState)
  }

  const resumeMatchedFiles = async () => {
    if (!walletId || matchedFiles.size === 0) return
    setUploading(true)
    setActionError(null)
    abortedRef.current = false

    for (const [targetFileId, file] of Array.from(matchedFiles.entries())) {
      const target = files.find((f) => f.fileId === targetFileId)
      if (!target?.uploadId) continue
      setRowState((prev) => ({ ...prev, [targetFileId]: 'uploading' }))
      try {
        const totalChunks = Math.ceil(file.size / MULTIPART_CHUNK_SIZE_BYTES)
        const statusRes = await fetchWithTimeout(
          `/api/upload/batch/upload-status?batchId=${fileId}&fileId=${targetFileId}&uploadId=${encodeURIComponent(target.uploadId)}&partCount=${totalChunks}&walletId=${encodeURIComponent(walletId)}`
        ).then((r) => r.json())
        if (!statusRes.success) throw new Error(statusRes.message ?? 'Could not resume this file')

        const parts = await uploadFileInChunks(
          file, MULTIPART_CHUNK_SIZE_BYTES, statusRes.data.presignedUrls, statusRes.data.completedParts,
          () => abortedRef.current
        )

        const completeRes = await fetchWithTimeout('/api/upload/batch/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId: fileId, fileId: targetFileId, uploadId: target.uploadId, parts, walletId }),
        }).then((r) => r.json())
        if (!completeRes.success) throw new Error(completeRes.message ?? 'Failed to finish this file')

        setRowState((prev) => ({ ...prev, [targetFileId]: 'done' }))
      } catch (err) {
        setRowState((prev) => ({ ...prev, [targetFileId]: 'error' }))
        setActionError(err instanceof Error ? err.message : 'Some files failed to resume')
      }
    }

    setUploading(false)
    setMatchedFiles(new Map())
    load()
  }

  const skipRemaining = async () => {
    if (!walletId) return
    setSkipping(true)
    setActionError(null)
    try {
      const stillMissing = files.filter((f) => f.status === 'pending').map((f) => f.fileId)
      const res = await fetch('/api/upload/batch/finalize-partial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: fileId, walletId, skipFileIds: stillMissing }),
      }).then((r) => r.json())
      if (!res.success) { setActionError(res.message ?? 'Could not finish this transfer'); return }
      router.push(`/transfer/${fileId}`)
    } finally {
      setSkipping(false)
    }
  }

  // ── Single-file resume ───────────────────────────────────────────────
  // The resume mechanism for a single file already exists and is fully
  // wired into the global upload context (lib/upload-context.tsx's
  // runUpload matches by filename+size+lastModified against a localStorage
  // entry and continues the same multipart upload with no new charge) — it
  // just never had a dedicated entry point. Re-selecting the same file
  // here and handing it to the normal startUpload does the rest; pricing/
  // expiry/recipients below are never actually sent anywhere on the resume
  // path (only used if no matching in-progress upload is found server-side,
  // which shouldn't happen for a transfer we already know is 'pending').
  const onSingleFileSelected = (file: File) => {
    if (!walletId) return
    setSingleFileResuming(true)
    startUpload(file, calculatePrice(file.size), walletId, [], DEFAULT_EXPIRY_DAYS)
  }

  if (loading) {
    return <div className="max-w-2xl mx-auto px-4 py-16 text-center text-muted">Loading…</div>
  }

  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-3">
        <AlertCircleIcon className="w-8 h-8 text-danger mx-auto" />
        <div className="text-text-primary font-semibold">{loadError}</div>
        <Link href="/transfers" className="text-accent text-sm hover:underline">Back to My Transfers</Link>
      </div>
    )
  }

  if (transferStatus !== 'pending') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-3">
        <CheckCircleIcon className="w-8 h-8 text-success mx-auto" />
        <div className="text-text-primary font-semibold">This transfer isn't paused — it's already {transferStatus}.</div>
        <Link href={`/transfer/${fileId}`} className="text-accent text-sm hover:underline">Go to transfer</Link>
      </div>
    )
  }

  if (singleFileResuming) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-3">
        <UploadCloudIcon className="w-8 h-8 text-accent mx-auto" />
        <div className="text-text-primary font-semibold">Resuming your upload…</div>
        <p className="text-sm text-muted">Track its progress in the tracker at the bottom-right, or from My Transfers.</p>
        <Link href="/transfers" className="text-accent text-sm hover:underline">Back to My Transfers</Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Resume this transfer</h1>
        <p className="text-sm text-muted mt-1">
          {isBatch
            ? `${uploadedCount} of ${files.length} files uploaded. Re-select the same folder to continue with what's missing.`
            : "This upload was interrupted. Re-select the same file to continue exactly where it left off — you won't be charged again."}
        </p>
      </div>

      {!isBatch && (
        <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-3">
          <UploadCloudIcon className="w-8 h-8 text-accent mx-auto" />
          <label className="inline-block bg-accent text-bg font-bold px-6 py-3 rounded-xl hover:bg-accent/90 transition-colors cursor-pointer">
            Choose the same file
            <input
              type="file"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onSingleFileSelected(f) }}
            />
          </label>
        </div>
      )}

      {isBatch && (
        <>
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="max-h-72 overflow-y-auto divide-y divide-border">
              {files.map((f) => {
                const state = rowState[f.fileId] ?? (f.status === 'pending' ? 'missing' : 'done')
                return (
                  <div key={f.fileId} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-8 h-8 rounded-lg bg-bg flex items-center justify-center flex-shrink-0">
                      <FileTypeIcon fileName={f.fileName} className="w-4 h-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-text-primary truncate">{f.relativePath || f.fileName}</div>
                      <div className="text-xs text-muted">{formatBytes(f.fileSizeBytes)}</div>
                    </div>
                    {state === 'done' && <CheckCircleIcon className="w-4 h-4 text-success flex-shrink-0" />}
                    {state === 'missing' && <span className="text-[11px] text-yellow-500 flex-shrink-0">Missing</span>}
                    {state === 'matched' && <span className="text-[11px] text-accent flex-shrink-0">Ready</span>}
                    {state === 'uploading' && <span className="w-3.5 h-3.5 border-2 border-accent/40 border-t-accent rounded-full animate-spin flex-shrink-0" />}
                    {state === 'error' && <AlertCircleIcon className="w-4 h-4 text-danger flex-shrink-0" />}
                  </div>
                )
              })}
            </div>
          </div>

          {missing.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-3">
              <PackageIcon className="w-8 h-8 text-accent mx-auto" />
              <label className="inline-block border border-border text-text-primary font-semibold px-6 py-3 rounded-xl hover:border-accent/60 transition-colors cursor-pointer">
                Choose the same folder
                <input
                  type="file"
                  // @ts-expect-error -- non-standard but universally supported directory-select attribute
                  webkitdirectory=""
                  multiple
                  className="hidden"
                  onChange={(e) => { if (e.target.files) onFolderSelected(e.target.files) }}
                />
              </label>
              {matchedFiles.size > 0 && (
                <button
                  onClick={resumeMatchedFiles}
                  disabled={uploading}
                  className="block mx-auto bg-accent text-bg font-bold px-6 py-3 rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {uploading ? 'Uploading…' : `Upload ${matchedFiles.size} matched file${matchedFiles.size > 1 ? 's' : ''}`}
                </button>
              )}
            </div>
          )}

          {actionError && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">{actionError}</div>
          )}

          {missing.length > 0 && (
            <button
              onClick={skipRemaining}
              disabled={skipping || uploading}
              className="w-full text-center text-sm text-muted hover:text-danger transition-colors py-2 disabled:opacity-50"
            >
              {skipping ? 'Finishing…' : `Give up on the ${missing.length} missing file${missing.length > 1 ? 's' : ''} & finish now (refunds their share)`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
