'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { Selection, MediaFile } from '@/types/studio'

interface SelectionItem {
  selection: Selection
  file: MediaFile
}

interface EditUploadState {
  status: 'idle' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
}

export default function SelectionsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const router = useRouter()

  const [items, setItems]         = useState<SelectionItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [printUrl, setPrintUrl]   = useState<string | null>(null)
  const [printExpiry, setPrintExpiry] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied]       = useState(false)
  const [uploadStates, setUploadStates] = useState<Map<string, EditUploadState>>(new Map())
  const [printBlockedMessage, setPrintBlockedMessage] = useState<string | null>(null)
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const needsEditingRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/studio/api/admin/projects/${projectId}/selections`).then((r) => r.json())
    if (res.success) setItems(res.data)
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  const setUploadState = (fileId: string, patch: Partial<EditUploadState>) =>
    setUploadStates((prev) => {
      const next = new Map(prev)
      next.set(fileId, { ...(prev.get(fileId) ?? { status: 'idle', progress: 0 }), ...patch })
      return next
    })

  const handleEditUpload = async (fileId: string, file: File) => {
    setUploadState(fileId, { status: 'uploading', progress: 0 })
    try {
      // 1. Get presigned PUT URL
      const initRes = await fetch(
        `/studio/api/admin/projects/${projectId}/files/${fileId}/upload-edited`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, mimeType: file.type }),
        }
      ).then((r) => r.json())

      if (!initRes.success) throw new Error(initRes.message ?? 'Upload init failed')
      const { presignedUrl, editedR2Key } = initRes.data

      // 2. PUT directly to R2
      const xhr = new XMLHttpRequest()
      await new Promise<void>((resolve, reject) => {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadState(fileId, { progress: Math.round((e.loaded / e.total) * 100) })
        }
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`R2 PUT ${xhr.status}`)))
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.open('PUT', presignedUrl)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.send(file)
      })

      // 3. Confirm in DB
      const completeRes = await fetch(
        `/studio/api/admin/projects/${projectId}/files/${fileId}/upload-edited-complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ editedR2Key }),
        }
      ).then((r) => r.json())

      if (!completeRes.success) throw new Error('Failed to confirm upload')

      setUploadState(fileId, { status: 'done', progress: 100 })
      // Refresh list to reflect editedR2Key
      load()
    } catch (err) {
      setUploadState(fileId, { status: 'error', error: err instanceof Error ? err.message : 'Upload failed' })
    }
  }

  const downloadOriginal = async (fileId: string) => {
    const res = await fetch(`/studio/api/admin/projects/${projectId}/files/${fileId}/download?version=original`).then((r) => r.json())
    if (res.success) window.open(res.data.url, '_blank')
  }

  const generatePrintLink = async () => {
    setGenerating(true)
    setPrintBlockedMessage(null)
    const res = await fetch(`/studio/api/admin/projects/${projectId}/print-link`, { method: 'POST' }).then((r) => r.json())
    setGenerating(false)
    if (res.success) {
      setPrintUrl(res.data.printUrl)
      setPrintExpiry(res.data.expiresAt)
    } else if (res.error === 'EDITS_PENDING') {
      setPrintBlockedMessage(res.message)
      needsEditingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      setPrintBlockedMessage(res.message ?? 'Could not generate print link. Please try again.')
    }
  }

  const copyPrintLink = async () => {
    if (!printUrl) return
    await navigator.clipboard.writeText(printUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const needsEditing  = items.filter((i) => i.selection.editingRequired)
  const noEditNeeded  = items.filter((i) => !i.selection.editingRequired)
  const editsDoneCount = needsEditing.filter((i) => !!(i.file.editedS3Key || i.file.editedR2Key) || uploadStates.get(i.file.fileId)?.status === 'done').length

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">
      {/* Header */}
      <div>
        <button onClick={() => router.back()} className="text-sm text-muted hover:text-text-primary transition-colors mb-3 flex items-center gap-1">
          ← Project
        </button>
        <h1 className="text-2xl font-bold text-text-primary">Client Selections</h1>
        <div className="flex gap-4 text-sm text-muted mt-1 flex-wrap">
          <span>{items.length} photos selected</span>
          {needsEditing.length > 0 && <span className="text-yellow-400">{needsEditing.length} need editing</span>}
          {items.filter((i) => i.selection.comment).length > 0 && (
            <span>{items.filter((i) => i.selection.comment).length} comments</span>
          )}
        </div>
      </div>

      {/* Needs Editing section */}
      {needsEditing.length > 0 && (
        <div ref={needsEditingRef} className="space-y-4 scroll-mt-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-text-primary flex items-center gap-2">
              <span className="text-yellow-400">✏️</span> Needs Editing
              <span className="text-xs text-muted font-normal">({editsDoneCount}/{needsEditing.length} done)</span>
            </h2>
          </div>
          <div className="space-y-3">
            {needsEditing.map(({ selection, file }) => {
              const upState = uploadStates.get(file.fileId) ?? { status: 'idle', progress: 0 }
              const isEditedDone = !!(file.editedS3Key || file.editedR2Key) || upState.status === 'done'
              return (
                <div key={file.fileId} className="bg-card border border-border rounded-2xl p-4 flex gap-4">
                  {/* Thumbnail */}
                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-bg border border-border flex-shrink-0">
                    {file.r2PreviewUrl
                      ? <img src={file.r2PreviewUrl} alt={file.originalFilename} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-muted text-xs">📄</div>}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="text-sm font-medium text-text-primary truncate">{file.originalFilename}</div>
                    {selection.comment && (
                      <div className="text-xs text-muted bg-bg border border-border rounded-lg px-3 py-2 italic">
                        "{selection.comment}"
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      {isEditedDone && (
                        <span className="text-xs text-success font-semibold">✓ Edited version uploaded</span>
                      )}
                      <button
                        onClick={() => downloadOriginal(file.fileId)}
                        className="text-xs bg-bg border border-border text-text-primary px-3 py-1.5 rounded-lg hover:border-accent hover:text-accent transition-colors"
                      >
                        ↓ Download Original
                      </button>
                      <label className="text-xs bg-accent text-bg font-semibold px-3 py-1.5 rounded-lg hover:bg-accent/90 transition-colors cursor-pointer">
                        {isEditedDone ? '↑ Re-upload Edited' : '↑ Upload Edited'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          ref={(el) => { if (el) fileInputRefs.current.set(file.fileId, el) }}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) handleEditUpload(file.fileId, f)
                          }}
                        />
                      </label>
                    </div>
                    {upState.status === 'uploading' && (
                      <div className="space-y-1">
                        <div className="h-1.5 bg-border rounded-full overflow-hidden">
                          <div className="h-full bg-accent transition-all rounded-full" style={{ width: `${upState.progress}%` }} />
                        </div>
                        <div className="text-xs text-muted">{upState.progress}%</div>
                      </div>
                    )}
                    {upState.status === 'error' && (
                      <div className="text-xs text-danger">{upState.error}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Final selects (no editing) */}
      {noEditNeeded.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-semibold text-text-primary">Final Selects</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {noEditNeeded.map(({ file, selection }) => (
              <div
                key={file.fileId}
                className="relative aspect-square rounded-xl overflow-hidden bg-card border border-border group"
                title={selection.comment || file.originalFilename}
              >
                {file.r2PreviewUrl
                  ? <img src={file.r2PreviewUrl} alt={file.originalFilename} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-muted text-xs">📄</div>}
                {selection.comment && (
                  <div className="absolute bottom-1 right-1 w-5 h-5 bg-accent/80 rounded-full flex items-center justify-center text-bg text-xs">💬</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Print link section */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-text-primary">Print Portal</h2>
          <p className="text-sm text-muted mt-1">
            Generate a 7-day secure link for your print partner to download all final photos.
          </p>
        </div>

        {printUrl ? (
          <div className="space-y-3">
            <div className="bg-success/10 border border-success/30 rounded-xl p-3 flex items-center gap-3">
              <div className="flex-1 text-sm text-success font-mono truncate">{printUrl}</div>
              <button
                onClick={copyPrintLink}
                className="text-xs bg-success/20 hover:bg-success/30 text-success px-3 py-1.5 rounded-lg font-semibold transition-colors"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            {printExpiry && (
              <div className="text-xs text-muted">
                Expires {new Date(printExpiry).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {printBlockedMessage && (
              <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-xl p-3 text-sm text-yellow-400">
                ⚠️ {printBlockedMessage}
              </div>
            )}
            <button
              onClick={generatePrintLink}
              disabled={generating}
              className="bg-accent text-bg font-bold px-6 py-3 rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-50 text-sm"
            >
              {generating ? 'Generating…' : 'Generate Print Link'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
