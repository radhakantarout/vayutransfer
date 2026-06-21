'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { StudioProject, MediaFile } from '@/types/studio'

const CHUNK_SIZE = 50 * 1024 * 1024 // 50MB

interface UploadItem {
  file: File
  fileId?: string
  progress: number
  status: 'queued' | 'uploading' | 'done' | 'error'
  error?: string
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'text-muted', ACTIVE: 'text-accent',
  SELECTION_RECEIVED: 'text-yellow-400', COMPLETED: 'text-success',
}

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

  const uploadFile = async (item: UploadItem, index: number) => {
    const update = (patch: Partial<UploadItem>) =>
      setUploads((prev) => prev.map((u, i) => (i === index ? { ...u, ...patch } : u)))

    update({ status: 'uploading', progress: 0 })
    const { file } = item
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
      file: f, progress: 0, status: 'queued',
    }))
    setUploads((prev) => {
      const next = [...prev, ...items]
      // Start uploads for new items
      items.forEach((_, i) => {
        setTimeout(() => uploadFile(next[prev.length + i], prev.length + i), 0)
      })
      return next
    })
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
      {/* Header */}
      <div>
        <button onClick={() => router.back()} className="text-sm text-muted hover:text-text-primary transition-colors mb-3 flex items-center gap-1">
          ← Projects
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{project.clientName}</h1>
            <div className="text-sm text-muted mt-1 flex gap-3">
              <span>{project.eventType.replace('_', ' ')}</span>
              <span>·</span>
              <span>{new Date(project.eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              <span>·</span>
              <span className={STATUS_COLOR[project.status]}>{project.status.replace('_', ' ')}</span>
            </div>
          </div>
          <div className="flex gap-2">
            {project.totalFiles > 0 && (
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
          {uploads.map((u, i) => (
            <div key={i} className="bg-card border border-border rounded-xl px-4 py-3">
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
