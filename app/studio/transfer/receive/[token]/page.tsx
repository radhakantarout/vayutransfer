'use client'

import { useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { CHUNK_SIZE, uploadFileInChunks, type PartRecord } from '@/lib/studio/clientUpload'

type Phase = 'idle' | 'uploading' | 'done' | 'error'

// Scoped to this one token — simpler than lib/studio/uploadResume.ts's
// projectId/fileId-shaped keys, since an anonymous RECEIVE upload doesn't
// know a fileId (there is none — it becomes a transfer record, not a
// MediaFile) and the token itself is the only stable identifier available
// both before and after a refresh.
interface ResumeEntry { transferId: string; uploadId: string; filename: string; size: number; lastModified: number }
function resumeKey(token: string) { return `vayu_transfer_receive_resume_${token}` }
function loadResume(token: string): ResumeEntry | null {
  try {
    const raw = localStorage.getItem(resumeKey(token))
    return raw ? (JSON.parse(raw) as ResumeEntry) : null
  } catch { return null }
}
function saveResume(token: string, entry: ResumeEntry): void {
  try { localStorage.setItem(resumeKey(token), JSON.stringify(entry)) } catch { /* ignore */ }
}
function clearResume(token: string): void {
  try { localStorage.removeItem(resumeKey(token)) } catch { /* ignore */ }
}

export default function TransferReceivePage() {
  const { token } = useParams<{ token: string }>()
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [filename, setFilename] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadFile = async (file: File) => {
    setPhase('uploading')
    setError(null)
    setFilename(file.name)
    setProgress(0)
    const partCount = Math.ceil(file.size / CHUNK_SIZE)

    try {
      let transferId: string
      let uploadId: string
      let presignedUrls: string[]
      let completedParts: PartRecord[] = []

      const existing = loadResume(token)
      let resumed = false
      if (existing && existing.filename === file.name && existing.size === file.size && existing.lastModified === file.lastModified) {
        const statusRes = await fetch(
          `/studio/api/transfer/receive/${token}/upload-status?uploadId=${encodeURIComponent(existing.uploadId)}&partCount=${partCount}`
        ).then((r) => r.json()).catch(() => null)
        if (statusRes?.success) {
          transferId = existing.transferId
          uploadId = existing.uploadId
          presignedUrls = statusRes.data.presignedUrls
          completedParts = statusRes.data.completedParts
          resumed = true
        } else {
          clearResume(token)
        }
      }

      if (!resumed) {
        const initRes = await fetch(`/studio/api/transfer/receive/${token}/upload-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size, partCount }),
        }).then((r) => r.json())
        if (!initRes.success) {
          throw new Error(
            initRes.error === 'TOKEN_EXPIRED' ? 'This link has expired.'
              : initRes.error === 'NOT_ACCEPTING_UPLOADS' ? 'This link has already been used.'
              : initRes.message ?? 'Could not start upload — the link may be invalid.'
          )
        }
        transferId = initRes.data.transferId
        uploadId = initRes.data.uploadId
        presignedUrls = initRes.data.presignedUrls
        saveResume(token, { transferId, uploadId, filename: file.name, size: file.size, lastModified: file.lastModified })
      }

      const parts = await uploadFileInChunks(file, presignedUrls!, completedParts, (_bytes, partsDone) => {
        setProgress(Math.round((partsDone / partCount) * 100))
      })

      const completeRes = await fetch(`/studio/api/transfer/receive/${token}/upload-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId: uploadId!, parts }),
      }).then((r) => r.json())
      if (!completeRes.success) throw new Error(completeRes.message ?? 'Could not finish upload')

      clearResume(token)
      setPhase('done')
    } catch (err) {
      setError((err instanceof Error ? err.message : 'Upload failed') + ' — re-select the same file to resume')
      setPhase('error')
    }
  }

  const handleFiles = (selected: FileList | null) => {
    if (!selected || selected.length === 0) return
    uploadFile(selected[0])
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center space-y-5">
        <div className="text-xl font-extrabold text-text-primary">
          Vayu<span className="text-accent">Studio</span>
          <span className="text-muted font-normal ml-2 text-sm">File Transfer</span>
        </div>

        {phase === 'idle' && (
          <>
            <div className="text-5xl">📤</div>
            <div className="text-text-primary font-semibold">Upload your file</div>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors
                ${dragOver ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'}`}
            >
              <div className="text-sm text-muted">Drag and drop, or click to choose a file</div>
              <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            </div>
            <div className="text-xs text-muted">Secure link · No login required</div>
          </>
        )}

        {phase === 'uploading' && (
          <>
            <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
            <div className="text-text-primary font-semibold break-all">{filename}</div>
            <div className="w-full bg-bg border border-border rounded-full h-2 overflow-hidden">
              <div className="bg-accent h-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="text-xs text-muted">Uploading… {progress}%</div>
          </>
        )}

        {phase === 'done' && (
          <>
            <div className="text-5xl">✓</div>
            <div className="text-success font-semibold">Upload complete</div>
            <div className="text-sm text-muted">Thanks — your file has been sent successfully.</div>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="text-4xl">⚠️</div>
            <div className="text-danger text-sm">{error}</div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-accent text-bg text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-accent/90 transition-colors"
            >
              Try Again
            </button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          </>
        )}
      </div>
    </div>
  )
}
