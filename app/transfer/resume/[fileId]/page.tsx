'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useWallet } from '@/lib/wallet-context'
import { useUpload, type BatchFileProgress } from '@/lib/upload-context'
import { fetchWithTimeout, uploadFileInChunks } from '@/lib/clientUpload'
import { calculatePrice } from '@/lib/pricing'
import { MULTIPART_CHUNK_SIZE_BYTES, DEFAULT_EXPIRY_DAYS } from '@/constants/pricing'
import { PackageIcon, CheckCircleIcon, AlertCircleIcon, UploadCloudIcon } from '@/components/icons'
import UploadProgressPanel from '@/components/UploadProgressPanel'
import type { ResumeInfoFile } from '@/app/api/transfers/[fileId]/resume-info/route'

function toBatchFileProgress(f: ResumeInfoFile): BatchFileProgress {
  return {
    fileId: f.fileId,
    path: f.relativePath || f.fileName,
    sizeBytes: f.fileSizeBytes,
    status: f.status === 'uploaded' ? 'done' : f.status,
    retryCount: 0,
  }
}

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
  const [batchFiles, setBatchFiles] = useState<BatchFileProgress[]>([])
  const [matchedFiles, setMatchedFiles] = useState<Map<string, File>>(new Map())
  const [uploading, setUploading] = useState(false)
  const [skipping, setSkipping] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [singleFileResuming, setSingleFileResuming] = useState(false)

  // Same "elapsed-so-far average speed" bookkeeping runBatchUpload/runUpload
  // use in lib/upload-context.tsx — kept local since this resume flow is
  // deliberately self-contained (see note below), not routed through that
  // shared context. Scoped to just the matched files being uploaded this
  // session (not the whole batch's lifetime), same as a fresh upload's own
  // stats only ever cover that one upload attempt.
  const [uploadedBytesThisSession, setUploadedBytesThisSession] = useState(0)
  const [speedBytesPerSec, setSpeedBytesPerSec] = useState(0)
  const [secondsRemaining, setSecondsRemaining] = useState(Infinity)
  const startTimeRef = useRef(0)
  const sessionBytesRef = useRef(0)
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
        setBatchFiles((res.data.files as ResumeInfoFile[]).map(toBatchFileProgress))
      })
      .catch(() => setLoadError('Network error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [fileId]) // eslint-disable-line react-hooks/exhaustive-deps

  const isBatch = !!fileCount
  const missing = files.filter((f) => f.status === 'pending')
  const uploadedCount = files.filter((f) => f.status !== 'pending').length
  const totalBytes = files.reduce((s, f) => s + f.fileSizeBytes, 0)
  const uploadedBytes = batchFiles.reduce((s, f) => s + (f.status === 'done' || f.status === 'skipped' ? f.sizeBytes : 0), 0) + uploadedBytesThisSession
  const percent = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0

  const patchBatchFile = (targetFileId: string, update: Partial<BatchFileProgress>) => {
    setBatchFiles((prev) => prev.map((f) => (f.fileId === targetFileId ? { ...f, ...update } : f)))
  }

  // ── Batch resume ──────────────────────────────────────────────────────
  // Deliberately self-contained here rather than routed through the global
  // upload-context — the resume page already knows the exact batchId and
  // exact missing files from the server (resume-info), so there's no need
  // to touch runBatchUpload's localStorage-matching machinery, which is
  // built around "maybe this file matches some past attempt," not "resume
  // this specific known batch." The progress UI itself is still the exact
  // same UploadProgressPanel the normal Send flow uses, per explicit
  // instruction not to make resuming look like a different feature.
  const onFilesSelected = (fileList: FileList) => {
    const next = new Map(matchedFiles)
    Array.from(fileList).forEach((file) => {
      const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
      const hit = missing.find((f) => (f.relativePath || f.fileName) === path && f.fileSizeBytes === file.size)
      if (hit) next.set(hit.fileId, file)
    })
    setMatchedFiles(next)
  }

  const resumeMatchedFiles = async () => {
    if (!walletId || matchedFiles.size === 0) return
    setUploading(true)
    setActionError(null)
    abortedRef.current = false
    startTimeRef.current = Date.now()
    sessionBytesRef.current = 0
    setUploadedBytesThisSession(0)
    setSpeedBytesPerSec(0)
    setSecondsRemaining(Infinity)

    // ETA/speed are scoped to just the matched files being uploaded this
    // session (not the whole batch) — same as a fresh upload's stats only
    // ever cover that one attempt, not the transfer's lifetime.
    const matchedBytesTotal = Array.from(matchedFiles.values()).reduce((s, f) => s + f.size, 0)

    for (const [targetFileId, file] of Array.from(matchedFiles.entries())) {
      const target = files.find((f) => f.fileId === targetFileId)
      if (!target?.uploadId) continue
      patchBatchFile(targetFileId, { status: 'uploading' })
      let bytesForThisFile = 0
      try {
        const totalChunks = Math.ceil(file.size / MULTIPART_CHUNK_SIZE_BYTES)
        const statusRes = await fetchWithTimeout(
          `/api/upload/batch/upload-status?batchId=${fileId}&fileId=${targetFileId}&uploadId=${encodeURIComponent(target.uploadId)}&partCount=${totalChunks}&walletId=${encodeURIComponent(walletId)}`
        ).then((r) => r.json())
        if (!statusRes.success) throw new Error(statusRes.message ?? 'Could not resume this file')

        const parts = await uploadFileInChunks(
          file, MULTIPART_CHUNK_SIZE_BYTES, statusRes.data.presignedUrls, statusRes.data.completedParts,
          () => abortedRef.current,
          (uploadedForFile) => {
            sessionBytesRef.current += uploadedForFile - bytesForThisFile
            bytesForThisFile = uploadedForFile
            setUploadedBytesThisSession(sessionBytesRef.current)
            const elapsed = (Date.now() - startTimeRef.current) / 1000
            const speed = elapsed > 0.5 ? sessionBytesRef.current / elapsed : 0
            setSpeedBytesPerSec(speed)
            setSecondsRemaining(speed > 0 ? (matchedBytesTotal - sessionBytesRef.current) / speed : Infinity)
          }
        )

        const completeRes = await fetchWithTimeout('/api/upload/batch/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId: fileId, fileId: targetFileId, uploadId: target.uploadId, parts, walletId }),
        }).then((r) => r.json())
        if (!completeRes.success) throw new Error(completeRes.message ?? 'Failed to finish this file')

        patchBatchFile(targetFileId, { status: 'done' })
      } catch (err) {
        patchBatchFile(targetFileId, { status: 'failed' })
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

  // While actively uploading matched files, show the exact same progress
  // UI as a fresh Send — no bespoke "resume" look, per explicit instruction.
  if (isBatch && uploading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-card border border-border rounded-2xl p-6">
          <UploadProgressPanel
            percent={percent}
            uploadedBytes={uploadedBytes}
            totalBytes={totalBytes}
            speedBytesPerSec={speedBytesPerSec}
            secondsRemaining={secondsRemaining}
            batchFiles={batchFiles}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Resume this transfer</h1>
        <p className="text-sm text-muted mt-1">
          {isBatch
            ? `${uploadedCount} of ${files.length} files uploaded. Re-select the same files or folder to continue with what's missing.`
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
          <div className="bg-card border border-border rounded-2xl p-6">
            <UploadProgressPanel
              title="Batch status"
              percent={percent}
              uploadedBytes={uploadedBytes}
              totalBytes={totalBytes}
              speedBytesPerSec={0}
              secondsRemaining={Infinity}
              batchFiles={batchFiles}
            />
          </div>

          {missing.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-3">
              <PackageIcon className="w-8 h-8 text-accent mx-auto" />
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <label className="inline-block border border-border text-text-primary font-semibold px-6 py-3 rounded-xl hover:border-accent/60 transition-colors cursor-pointer">
                  Choose files
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => { if (e.target.files) onFilesSelected(e.target.files) }}
                  />
                </label>
                <label className="inline-block border border-border text-text-primary font-semibold px-6 py-3 rounded-xl hover:border-accent/60 transition-colors cursor-pointer">
                  Choose the same folder
                  <input
                    type="file"
                    // @ts-expect-error -- non-standard but universally supported directory-select attribute
                    webkitdirectory=""
                    multiple
                    className="hidden"
                    onChange={(e) => { if (e.target.files) onFilesSelected(e.target.files) }}
                  />
                </label>
              </div>
              <p className="text-xs text-muted">
                Use "Choose files" if you selected individual files last time, or "Choose the same folder" if you selected a whole folder.
              </p>
              {matchedFiles.size > 0 && (
                <button
                  onClick={resumeMatchedFiles}
                  className="block mx-auto bg-accent text-bg font-bold px-6 py-3 rounded-xl hover:bg-accent/90 transition-colors"
                >
                  Upload {matchedFiles.size} matched file{matchedFiles.size > 1 ? 's' : ''}
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
              disabled={skipping}
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
