'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { StudioProject, MediaFile, EventType } from '@/types/studio'

const CHUNK_SIZE = 50 * 1024 * 1024 // 50MB

interface UploadItem {
  id: string
  file: File
  fileId?: string
  progress: number
  status: 'queued' | 'uploading' | 'done' | 'error'
  error?: string
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
  const [shareUrl, setShareUrl]   = useState<string | null>(null)
  const [sharing, setSharing]     = useState(false)
  const [copied, setCopied]       = useState(false)
  const [loading, setLoading]     = useState(true)
  const [editOpen, setEditOpen]   = useState(false)
  const [editForm, setEditForm]   = useState<EditForm | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const fileInputRef              = useRef<HTMLInputElement>(null)

  const loadProject = useCallback(async () => {
    const [projRes, filesRes] = await Promise.all([
      fetch('/studio/api/admin/projects').then((r) => r.json()),
      fetch(`/studio/api/admin/projects/${projectId}/files`).then((r) => r.json()),
    ])
    if (projRes.success) {
      const p = projRes.data.find((x: StudioProject) => x.projectId === projectId)
      setProject(p ?? null)
    }
    if (filesRes.success) setFiles(filesRes.data)
    setLoading(false)
  }, [projectId])

  useEffect(() => { loadProject() }, [loadProject])

  const uploadFile = async (file: File, itemId: string) => {
    const update = (patch: Partial<UploadItem>) =>
      setUploads((prev) => prev.map((u) => (u.id === itemId ? { ...u, ...patch } : u)))

    update({ status: 'uploading', progress: 0 })
    const partCount = Math.ceil(file.size / CHUNK_SIZE)

    try {
      // 1. Get presigned URLs
      const initRes = await fetch(`/studio/api/admin/projects/${projectId}/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size, partCount }),
      }).then((r) => r.json())

      if (!initRes.success) throw new Error(initRes.message ?? 'Upload init failed')
      const { fileId, uploadId, presignedUrls } = initRes.data
      update({ fileId })

      // 2. Upload parts
      const parts: { PartNumber: number; ETag: string }[] = []
      for (let i = 0; i < partCount; i++) {
        const start = i * CHUNK_SIZE
        const chunk = file.slice(start, start + CHUNK_SIZE)
        const res = await fetch(presignedUrls[i], { method: 'PUT', body: chunk })
        const etag = res.headers.get('ETag') ?? ''
        parts.push({ PartNumber: i + 1, ETag: etag })
        update({ progress: Math.round(((i + 1) / partCount) * 100) })
      }

      // 3. Complete
      const completeRes = await fetch(`/studio/api/admin/projects/${projectId}/upload-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, uploadId, parts }),
      }).then((r) => r.json())

      if (!completeRes.success) throw new Error(completeRes.message ?? 'Complete failed')
      update({ status: 'done', progress: 100 })
      loadProject()
    } catch (err) {
      update({ status: 'error', error: err instanceof Error ? err.message : 'Upload failed' })
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
    const res = await fetch(`/studio/api/admin/projects/${projectId}/share-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiryDays: 30 }),
    }).then((r) => r.json())
    setSharing(false)
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
            {project.totalFiles > 0 && project.status !== 'COMPLETED' && (
              <button
                onClick={generateShareLink}
                disabled={sharing}
                className="bg-accent text-bg text-sm font-semibold px-4 py-2 rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {sharing ? 'Generating…' : 'Share with Client'}
              </button>
            )}
          </div>
        </div>
      </div>

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
