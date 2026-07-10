'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { StudioProject, MediaFile, EventType } from '@/types/studio'
import { loadUploadResume, saveUploadResume, clearUploadResume } from '@/lib/studio/uploadResume'
import { CHUNK_SIZE, uploadFileInChunks, type PartRecord } from '@/lib/studio/clientUpload'

interface UploadItem {
  id: string
  file: File
  fileId?: string
  progress: number
  status: 'queued' | 'uploading' | 'done' | 'error'
  error?: string
}

// Resumes a previously interrupted upload if the same file (matched by
// name+size+lastModified — the only thing stable across a browser refresh)
// was seen before and the server still has that multipart upload alive.
// Falls back to starting fresh whenever resume can't be verified server-side.
async function initOrResumeUpload(
  projectId: string,
  file: File,
  partCount: number
): Promise<{ fileId: string; uploadId: string; presignedUrls: string[]; completedParts: PartRecord[] }> {
  const existing = loadUploadResume(projectId, file.name, file.size, file.lastModified)
  if (existing) {
    const statusRes = await fetch(
      `/studio/api/admin/projects/${projectId}/files/${existing.fileId}/upload-status?uploadId=${encodeURIComponent(existing.uploadId)}&partCount=${partCount}`
    ).then((r) => r.json()).catch(() => null)
    if (statusRes?.success) {
      return {
        fileId: existing.fileId,
        uploadId: existing.uploadId,
        presignedUrls: statusRes.data.presignedUrls,
        completedParts: statusRes.data.completedParts,
      }
    }
    clearUploadResume(projectId, file.name, file.size, file.lastModified)
  }

  const initRes = await fetch(`/studio/api/admin/projects/${projectId}/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size, partCount }),
  }).then((r) => r.json())
  if (!initRes.success) throw new Error(initRes.message ?? 'Upload init failed')
  const { fileId, uploadId, presignedUrls } = initRes.data
  saveUploadResume({ projectId, fileId, uploadId, filename: file.name, size: file.size, lastModified: file.lastModified })
  return { fileId, uploadId, presignedUrls, completedParts: [] }
}

interface EditForm {
  clientName: string
  clientEmail: string
  clientPhone: string
  eventDate: string
  eventType: EventType
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'text-muted', ACTIVE: 'text-accent',
  SELECTION_RECEIVED: 'text-yellow-400', COMPLETED: 'text-success',
}

const EVENT_TYPES: EventType[] = ['WEDDING', 'PRE_WEDDING', 'CORPORATE', 'SCHOOL', 'OTHER']

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const router = useRouter()

  const [project, setProject]     = useState<StudioProject | null>(null)
  const [files, setFiles]         = useState<MediaFile[]>([])
  const [uploads, setUploads]     = useState<UploadItem[]>([])
  const [shareUrl, setShareUrl]       = useState<string | null>(null)
  const [sharing, setSharing]         = useState(false)
  const [copied, setCopied]           = useState(false)
  const [showShareSetup, setShowShareSetup] = useState(false)
  const [selMin, setSelMin]           = useState(0)
  const [selMax, setSelMax]           = useState(0)
  const [loading, setLoading]     = useState(true)
  const [editOpen, setEditOpen]   = useState(false)
  const [editForm, setEditForm]   = useState<EditForm | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const fileInputRef              = useRef<HTMLInputElement>(null)
  // Sequence counter — incremented on every files fetch so stale in-flight
  // responses from concurrent loadProject/refreshFiles calls are discarded.
  const filesSeqRef               = useRef(0)

  const refreshFiles = useCallback(async () => {
    const seq = ++filesSeqRef.current
    const res = await fetch(`/studio/api/admin/projects/${projectId}/files`).then(r => r.json())
    if (seq !== filesSeqRef.current) return // a newer request is in flight — discard
    if (res.success) setFiles(res.data)
  }, [projectId])

  const loadProject = useCallback(async () => {
    const projRes = await fetch('/studio/api/admin/projects').then(r => r.json())
    if (projRes.success) {
      const p = projRes.data.find((x: StudioProject) => x.projectId === projectId)
      setProject(p ?? null)
    }
    await refreshFiles()
    setLoading(false)
  }, [projectId, refreshFiles])

  useEffect(() => { loadProject() }, [loadProject])

  // Auto-refresh every 3 s while any uploaded file is still watermarking (PROCESSING).
  // State-driven so concurrent uploads can never cancel each other's polls.
  useEffect(() => {
    const hasDoneUploads = uploads.some(u => u.status === 'done')
    const hasProcessing  = files.some(f => f.processingStatus === 'PROCESSING')
    if (!hasDoneUploads || !hasProcessing) return
    const timer = setTimeout(refreshFiles, 3000)
    return () => clearTimeout(timer)
  }, [files, uploads, refreshFiles])

  const uploadFile = async (file: File, itemId: string) => {
    const update = (patch: Partial<UploadItem>) =>
      setUploads((prev) => prev.map((u) => (u.id === itemId ? { ...u, ...patch } : u)))

    update({ status: 'uploading', progress: 0 })
    const partCount = Math.ceil(file.size / CHUNK_SIZE)

    try {
      // 1. Get presigned URLs — resumes from a previous attempt if the same
      // file was seen before and the server still has that upload alive.
      const { fileId, uploadId, presignedUrls, completedParts } = await initOrResumeUpload(projectId, file, partCount)
      update({ fileId })

      // 2. Upload parts — skip any already confirmed by the server, retry
      // transient failures on the rest before giving up.
      const parts: PartRecord[] = await uploadFileInChunks(file, presignedUrls, completedParts, (_bytes, partsDone) => {
        update({ progress: Math.round((partsDone / partCount) * 100) })
      })

      // 3. Complete
      const completeRes = await fetch(`/studio/api/admin/projects/${projectId}/upload-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, uploadId, parts }),
      }).then((r) => r.json())

      if (!completeRes.success) throw new Error(completeRes.message ?? 'Complete failed')
      clearUploadResume(projectId, file.name, file.size, file.lastModified)
      update({ status: 'done', progress: 100 })
      refreshFiles()
    } catch (err) {
      update({
        status: 'error',
        error: (err instanceof Error ? err.message : 'Upload failed') + ' — re-select the same file to resume',
      })
    }
  }

  const handleFiles = (selected: FileList | null) => {
    if (!selected) return
    const items: UploadItem[] = Array.from(selected).map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      progress: 0,
      status: 'queued' as const,
    }))
    // Pure state update — no side effects inside the updater (StrictMode calls updaters twice in dev)
    setUploads((prev) => [...prev, ...items])
    // Start uploads outside the updater so they fire exactly once
    items.forEach((item) => uploadFile(item.file, item.id))
  }

  const openEdit = () => {
    if (!project) return
    setEditForm({
      clientName:  project.clientName,
      clientEmail: project.clientEmail ?? '',
      clientPhone: project.clientPhone ?? '',
      eventDate:   project.eventDate,
      eventType:   project.eventType,
    })
    setEditError(null)
    setEditOpen(true)
  }

  const saveEdit = async () => {
    if (!editForm) return
    setEditSaving(true)
    setEditError(null)
    try {
      const res = await fetch(`/studio/api/admin/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      }).then((r) => r.json())
      if (!res.success) {
        setEditError(res.message ?? 'Save failed')
      } else {
        setEditOpen(false)
        await loadProject()
      }
    } catch {
      setEditError('Network error')
    } finally {
      setEditSaving(false)
    }
  }

  const generateShareLink = async () => {
    setSharing(true)
    const hasRange = selMax > 0
    const res = await fetch(`/studio/api/admin/projects/${projectId}/share-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expiryDays: 30,
        ...(hasRange ? { selectionMin: selMin, selectionMax: selMax } : {}),
      }),
    }).then((r) => r.json())
    setSharing(false)
    setShowShareSetup(false)
    if (res.success) setShareUrl(res.data.shareUrl)
  }

  const copyLink = async () => {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!project) return (
    <div className="max-w-2xl mx-auto px-6 py-10 text-danger">Project not found.</div>
  )

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
      {/* Edit modal */}
      {editOpen && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <h2 className="text-lg font-bold text-text-primary">Edit Project</h2>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted mb-1 block">Client Name *</label>
                <input
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                  value={editForm.clientName}
                  onChange={(e) => setEditForm({ ...editForm, clientName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted mb-1 block">Email</label>
                  <input
                    type="email"
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                    value={editForm.clientEmail}
                    onChange={(e) => setEditForm({ ...editForm, clientEmail: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">Phone</label>
                  <input
                    type="tel"
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                    value={editForm.clientPhone}
                    onChange={(e) => setEditForm({ ...editForm, clientPhone: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted mb-1 block">Event Date *</label>
                  <input
                    type="date"
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                    value={editForm.eventDate}
                    onChange={(e) => setEditForm({ ...editForm, eventDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">Event Type *</label>
                  <select
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                    value={editForm.eventType}
                    onChange={(e) => setEditForm({ ...editForm, eventType: e.target.value as EventType })}
                  >
                    {EVENT_TYPES.map((t) => (
                      <option key={t} value={t}>{t.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {editError && (
              <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{editError}</div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setEditOpen(false)}
                className="flex-1 bg-bg border border-border text-text-primary text-sm font-semibold py-2 rounded-lg hover:border-accent/50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={editSaving || !editForm.clientName || !editForm.eventDate}
                className="flex-1 bg-accent text-bg text-sm font-semibold py-2 rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <button onClick={() => router.back()} className="text-sm text-muted hover:text-text-primary transition-colors mb-3 flex items-center gap-1">
          ← Projects
        </button>
        {/* Sub-nav tabs */}
        <div className="flex gap-1 mb-6 border-b border-border">
          {[
            { label: 'All Photos', href: `/studio/dashboard/projects/${projectId}` },
            { label: 'People ✨', href: `/studio/dashboard/projects/${projectId}/faces` },
            { label: 'Selections', href: `/studio/dashboard/projects/${projectId}/selections` },
            { label: 'Raw Transfers', href: `/studio/dashboard/projects/${projectId}/transfers` },
          ].map(tab => (
            <a key={tab.href} href={tab.href}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors
                ${tab.label.startsWith('All') ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-text-primary'}`}>
              {tab.label}
            </a>
          ))}
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-text-primary">{project.clientName}</h1>
              <button
                onClick={openEdit}
                className="text-muted hover:text-accent transition-colors p-1"
                title="Edit project details"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </div>
            <div className="text-sm text-muted mt-1 flex gap-3 flex-wrap">
              <span>{project.eventType.replace('_', ' ')}</span>
              <span>·</span>
              <span>{new Date(project.eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              {project.clientPhone && <><span>·</span><span>{project.clientPhone}</span></>}
              <span>·</span>
              <span className={STATUS_COLOR[project.status]}>{project.status.replace('_', ' ')}</span>
            </div>
          </div>
          <div className="flex gap-2">
            {(project.status === 'SELECTION_RECEIVED' || project.status === 'COMPLETED') && (
              <a
                href={`/studio/dashboard/projects/${projectId}/selections`}
                className="bg-yellow-400 text-bg text-sm font-semibold px-4 py-2 rounded-lg hover:bg-yellow-300 transition-colors"
              >
                View Selections
              </a>
            )}
            {project.totalFiles > 0 && project.status !== 'COMPLETED' && !showShareSetup && (
              <button
                onClick={() => setShowShareSetup(true)}
                className="bg-accent text-bg text-sm font-semibold px-4 py-2 rounded-lg hover:bg-accent/90 transition-colors"
              >
                Share with Client
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Share setup panel */}
      {showShareSetup && (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-text-primary">Set selection target</h3>
              <p className="text-xs text-muted mt-0.5">How many photos should the client select for their album?</p>
            </div>
            <button onClick={() => setShowShareSetup(false)} className="text-muted hover:text-text-primary transition-colors flex-shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Minimum</label>
              <div className="relative">
                <input
                  type="number" min={0} max={1000} value={selMin}
                  onChange={(e) => {
                    const v = Math.min(1000, Math.max(0, Number(e.target.value)))
                    setSelMin(v)
                    if (selMax > 0 && v > selMax) setSelMax(v)
                  }}
                  className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent/60 transition-colors pr-10"
                  placeholder="0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">photos</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Maximum</label>
              <div className="relative">
                <input
                  type="number" min={0} max={1000} value={selMax}
                  onChange={(e) => {
                    const v = Math.min(1000, Math.max(0, Number(e.target.value)))
                    setSelMax(v)
                    if (selMin > v && v > 0) setSelMin(v)
                  }}
                  className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent/60 transition-colors pr-10"
                  placeholder="0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">photos</span>
              </div>
            </div>
          </div>

          {/* Visual range bar */}
          {selMax > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted">
                <span>0</span><span>500</span><span>1000</span>
              </div>
              <div className="h-2 bg-border rounded-full overflow-hidden relative">
                <div
                  className="absolute h-full bg-accent/30 rounded-full"
                  style={{ left: `${(selMin / 1000) * 100}%`, width: `${((selMax - selMin) / 1000) * 100}%` }}
                />
              </div>
              <p className="text-xs text-muted text-center">
                Client must select between <span className="font-semibold text-accent">{selMin}</span> and <span className="font-semibold text-accent">{selMax}</span> photos
              </p>
            </div>
          )}

          <p className="text-[11px] text-muted">Leave maximum at 0 to send without a selection target.</p>

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => { setSelMin(0); setSelMax(0); generateShareLink() }}
              disabled={sharing}
              className="text-sm text-muted hover:text-text-primary border border-border px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              Skip target
            </button>
            <button
              onClick={generateShareLink}
              disabled={sharing}
              className="flex-1 bg-accent text-bg text-sm font-semibold py-2 rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {sharing ? 'Generating…' : selMax > 0 ? `Generate & Share (${selMin}–${selMax} photos)` : 'Generate & Share'}
            </button>
          </div>
        </div>
      )}

      {/* Share link */}
      {shareUrl && (
        <div className="bg-success/10 border border-success/30 rounded-xl p-4 flex items-center gap-3">
          <div className="flex-1 text-sm text-success font-mono truncate">{shareUrl}</div>
          <button
            onClick={copyLink}
            className="text-xs bg-success/20 hover:bg-success/30 text-success px-3 py-1.5 rounded-lg font-semibold transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}

      {/* Upload zone */}
      <div
        className="border-2 border-dashed border-border rounded-2xl p-10 text-center cursor-pointer hover:border-accent/50 transition-colors"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
      >
        <div className="text-4xl mb-3">📸</div>
        <div className="text-text-primary font-semibold">Drop photos here or click to upload</div>
        <div className="text-muted text-sm mt-1">JPG, PNG, WEBP, MP4 supported · Max 10GB per file</div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Upload progress */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-text-primary">Uploads</h3>
          {uploads.map((u) => (
            <div key={u.id} className="bg-card border border-border rounded-xl px-4 py-3">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-text-primary truncate max-w-xs">{u.file.name}</span>
                <span className={
                  u.status === 'done' ? 'text-success' :
                  u.status === 'error' ? 'text-danger' :
                  'text-muted'
                }>
                  {u.status === 'done' ? 'Done' :
                   u.status === 'error' ? u.error ?? 'Error' :
                   u.status === 'uploading' ? `${u.progress}%` : 'Queued'}
                </span>
              </div>
              {u.status === 'uploading' && (
                <div className="h-1.5 bg-border rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${u.progress}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Photo grid */}
      {files.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text-primary mb-4">{files.length} photos</h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {files.map((f) => (
              <div key={f.fileId} className="relative aspect-square rounded-lg overflow-hidden bg-card border border-border group">
                {f.r2PreviewUrl ? (
                  <img src={f.r2PreviewUrl} alt={f.originalFilename} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted text-xs">
                    {f.processingStatus === 'PROCESSING' ? '⏳' : '📄'}
                  </div>
                )}
                {f.processingStatus !== 'READY' && (
                  <div className="absolute inset-0 bg-bg/60 flex items-center justify-center text-xs text-muted">
                    {f.processingStatus}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
