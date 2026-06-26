'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { StudioProject, MediaFile } from '@/types/studio'
import EditEventModal from './EditEventModal'

const CHUNK_SIZE = 50 * 1024 * 1024

interface UploadItem {
  id: string; file: File; progress: number
  status: 'queued' | 'uploading' | 'done' | 'error'; error?: string
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'text-muted', ACTIVE: 'text-accent',
  SELECTION_RECEIVED: 'text-yellow-400', COMPLETED: 'text-success',
}
const EVENT_ICON: Record<string, string> = {
  WEDDING: '💒', MEHENDI: '🪔', RECEPTION: '🎊', ENGAGEMENT: '💍',
  PRE_WEDDING: '📸', BIRTHDAY: '🎂', CORPORATE: '🏢', SCHOOL: '🎒', OTHER: '📷',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

type DeleteMode = 'selected' | 'all' | null

interface Props {
  project: StudioProject
  onUpdated: () => void
}

export default function EventSection({ project, onUpdated }: Props) {
  const [files, setFiles]           = useState<MediaFile[]>([])
  const [loading, setLoading]       = useState(true)
  const [uploads, setUploads]       = useState<UploadItem[]>([])
  const [editOpen, setEditOpen]     = useState(false)
  const [shareUrl, setShareUrl]     = useState<string | null>(null)
  const [sharing, setSharing]       = useState(false)
  const [copied, setCopied]         = useState(false)
  const [showShareSetup, setShowShareSetup] = useState(false)
  const [selMin, setSelMin]         = useState(project.selectionMin ?? 0)
  const [selMax, setSelMax]         = useState(project.selectionMax ?? 0)
  const [uploadOpen, setUploadOpen] = useState(false)

  // Photo grid
  const [zoomLevel, setZoomLevel]       = useState(6)
  const [gridSelected, setGridSelected] = useState<Set<string>>(new Set())
  const [deleteMode, setDeleteMode]     = useState<DeleteMode>(null)
  const [deleting, setDeleting]         = useState(false)
  const [dragRect, setDragRect]         = useState<{ left: number; top: number; width: number; height: number } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const gridRef      = useRef<HTMLDivElement>(null)
  const dragState    = useRef<{ active: boolean; startX: number; startY: number; moved: boolean }>({
    active: false, startX: 0, startY: 0, moved: false,
  })

  const loadFiles = useCallback(async () => {
    const res = await fetch(`/studio/api/admin/projects/${project.projectId}/files`).then(r => r.json())
    if (res.success) setFiles(res.data)
    setLoading(false)
  }, [project.projectId])

  useEffect(() => { loadFiles() }, [loadFiles])

  useEffect(() => { if (!loading && files.length === 0) setUploadOpen(true) }, [loading, files.length])

  // Global mouse handlers for rubber-band drag select
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragState.current.active || !gridRef.current) return
      const gr = gridRef.current.getBoundingClientRect()
      const cx = e.clientX - gr.left
      const cy = e.clientY - gr.top
      const { startX, startY } = dragState.current
      if (Math.abs(cx - startX) > 4 || Math.abs(cy - startY) > 4) dragState.current.moved = true
      if (!dragState.current.moved) return
      setDragRect({
        left: Math.min(startX, cx), top: Math.min(startY, cy),
        width: Math.abs(cx - startX), height: Math.abs(cy - startY),
      })
    }

    const onUp = (e: MouseEvent) => {
      if (!dragState.current.active) return
      const { startX, startY, moved } = dragState.current
      dragState.current.active = false
      dragState.current.moved  = false
      setDragRect(null)
      if (!moved || !gridRef.current) return

      const gr = gridRef.current.getBoundingClientRect()
      const ex = e.clientX - gr.left
      const ey = e.clientY - gr.top
      const selL = Math.min(startX, ex) + gr.left
      const selT = Math.min(startY, ey) + gr.top
      const selR = Math.max(startX, ex) + gr.left
      const selB = Math.max(startY, ey) + gr.top

      const toSelect = new Set<string>()
      gridRef.current.querySelectorAll('[data-fileid]').forEach(el => {
        const r = el.getBoundingClientRect()
        if (r.left < selR && r.right > selL && r.top < selB && r.bottom > selT)
          toSelect.add((el as HTMLElement).dataset.fileid!)
      })
      if (toSelect.size > 0)
        setGridSelected(prev => { const n = new Set(prev); toSelect.forEach(id => n.add(id)); return n })
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const handleGridMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('[data-fileid]')) return
    const gr = gridRef.current!.getBoundingClientRect()
    dragState.current = { active: true, startX: e.clientX - gr.left, startY: e.clientY - gr.top, moved: false }
    e.preventDefault()
  }

  const togglePhoto = (fileId: string) => {
    setGridSelected(prev => { const n = new Set(prev); n.has(fileId) ? n.delete(fileId) : n.add(fileId); return n })
  }

  const deleteFiles = async (fileIds: string[]) => {
    if (!fileIds.length) return
    setDeleting(true)
    await Promise.all(
      fileIds.map(fid => fetch(`/studio/api/admin/projects/${project.projectId}/files/${fid}`, { method: 'DELETE' }))
    )
    setDeleteMode(null)
    setGridSelected(new Set())
    setDeleting(false)
    await loadFiles()
    onUpdated()
  }

  const uploadFile = async (file: File, itemId: string) => {
    const update = (patch: Partial<UploadItem>) =>
      setUploads(prev => prev.map(u => u.id === itemId ? { ...u, ...patch } : u))
    update({ status: 'uploading', progress: 0 })
    const partCount = Math.ceil(file.size / CHUNK_SIZE)
    try {
      const initRes = await fetch(`/studio/api/admin/projects/${project.projectId}/upload-url`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size, partCount }),
      }).then(r => r.json())
      if (!initRes.success) throw new Error(initRes.message ?? 'Upload init failed')
      const { fileId, uploadId, presignedUrls } = initRes.data
      const parts: { PartNumber: number; ETag: string }[] = []
      for (let i = 0; i < partCount; i++) {
        const chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
        const res   = await fetch(presignedUrls[i], { method: 'PUT', body: chunk })
        parts.push({ PartNumber: i + 1, ETag: res.headers.get('ETag') ?? '' })
        update({ progress: Math.round(((i + 1) / partCount) * 100) })
      }
      const completeRes = await fetch(`/studio/api/admin/projects/${project.projectId}/upload-complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, uploadId, parts }),
      }).then(r => r.json())
      if (!completeRes.success) throw new Error(completeRes.message ?? 'Complete failed')
      update({ status: 'done', progress: 100 })
      loadFiles(); onUpdated()
    } catch (err) {
      update({ status: 'error', error: err instanceof Error ? err.message : 'Upload failed' })
    }
  }

  const handleFiles = (selected: FileList | null) => {
    if (!selected) return
    const items: UploadItem[] = Array.from(selected).map(f => ({
      id: crypto.randomUUID(), file: f, progress: 0, status: 'queued' as const,
    }))
    setUploads(prev => [...prev, ...items])
    items.forEach(item => uploadFile(item.file, item.id))
  }

  const generateShareLink = async () => {
    setSharing(true)
    const hasRange = selMax > 0
    const res = await fetch(`/studio/api/admin/projects/${project.projectId}/share-link`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiryDays: 30, ...(hasRange ? { selectionMin: selMin, selectionMax: selMax } : {}) }),
    }).then(r => r.json())
    setSharing(false); setShowShareSetup(false)
    if (res.success) setShareUrl(res.data.shareUrl)
  }

  const copyLink = async () => {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const activeUploads   = uploads.filter(u => u.status !== 'done')
  const selectedCount   = gridSelected.size
  const deleteTargetIds = deleteMode === 'all' ? files.map(f => f.fileId) : Array.from(gridSelected)

  return (
    <>
      {editOpen && (
        <EditEventModal
          project={project}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); onUpdated() }}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <div className="text-4xl mb-3">🗑️</div>
              <h3 className="text-base font-bold text-text-primary">
                {deleteMode === 'all'
                  ? `Delete all ${files.length} photos?`
                  : `Delete ${selectedCount} photo${selectedCount !== 1 ? 's' : ''}?`}
              </h3>
              <p className="text-xs text-muted mt-1.5">This cannot be undone. Photos will be permanently removed from this event.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteMode(null)} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text-primary hover:bg-border/40 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={() => deleteFiles(deleteTargetIds)} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-60 transition-colors">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="border border-border rounded-2xl overflow-hidden bg-card">

        {/* ── Event header ──────────────────────────────────────── */}
        <div className="px-5 py-4 flex items-start justify-between gap-4 border-b border-border">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base">{EVENT_ICON[project.eventType] ?? '📷'}</span>
              <h2 className="text-lg font-bold text-text-primary">{project.eventType.replace(/_/g, ' ')}</h2>
              <span className="text-sm text-muted font-medium">{project.clientName}</span>
              <span className={`text-xs font-bold uppercase tracking-wide ${STATUS_COLOR[project.status]}`}>
                {project.status.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted flex-wrap">
              <span>{fmtDate(project.eventDate)}</span>
              {project.eventLocation && <><span>·</span><span>{project.eventLocation}</span></>}
              {project.clientPhone   && <><span>·</span><span>{project.clientPhone}</span></>}
              {project.clientEmail   && <><span>·</span><span>{project.clientEmail}</span></>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {(project.status === 'SELECTION_RECEIVED' || project.status === 'COMPLETED') && (
              <a href={`/studio/dashboard/projects/${project.projectId}/selections`}
                className="bg-yellow-400 text-bg text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-yellow-300 transition-colors">
                Selections
              </a>
            )}
            {project.totalFiles > 0 && project.status !== 'COMPLETED' && !showShareSetup && (
              <button onClick={() => setShowShareSetup(true)}
                className="bg-accent text-bg text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-accent/90 transition-colors">
                Share
              </button>
            )}
            <button onClick={() => setUploadOpen(v => !v)} title="Upload photos"
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted hover:text-accent hover:border-accent/40 hover:bg-accent/10 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </button>
            <button onClick={() => setEditOpen(true)} title="Edit event"
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted hover:text-accent hover:border-accent/40 hover:bg-accent/10 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Share setup panel ─────────────────────────────────── */}
        {showShareSetup && (
          <div className="px-5 py-4 border-b border-border bg-border/10 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-text-primary">Set selection target <span className="font-normal text-muted">(optional)</span></p>
              <button onClick={() => setShowShareSetup(false)} className="text-muted hover:text-text-primary">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted">Min</label>
                <input type="number" min={0} max={1000} value={selMin}
                  onChange={e => { const v = Math.min(1000, Math.max(0, Number(e.target.value))); setSelMin(v); if (selMax > 0 && v > selMax) setSelMax(v) }}
                  className="w-20 bg-bg border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent/60" />
              </div>
              <span className="text-muted text-sm">–</span>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted">Max</label>
                <input type="number" min={0} max={1000} value={selMax}
                  onChange={e => { const v = Math.min(1000, Math.max(0, Number(e.target.value))); setSelMax(v); if (selMin > v && v > 0) setSelMin(v) }}
                  className="w-20 bg-bg border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent/60" />
              </div>
              <span className="text-xs text-muted">photos</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setSelMin(0); setSelMax(0); generateShareLink() }} disabled={sharing}
                className="text-xs text-muted border border-border px-3 py-1.5 rounded-lg hover:bg-border/40 transition-colors disabled:opacity-50">
                Skip target
              </button>
              <button onClick={generateShareLink} disabled={sharing}
                className="flex-1 text-xs bg-accent text-bg font-bold py-1.5 rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50">
                {sharing ? 'Generating…' : selMax > 0 ? `Generate & Share (${selMin}–${selMax})` : 'Generate & Share'}
              </button>
            </div>
          </div>
        )}

        {/* ── Share link result ─────────────────────────────────── */}
        {shareUrl && (
          <div className="px-5 py-3 border-b border-border bg-success/5 flex items-center gap-3">
            <div className="flex-1 text-xs text-success font-mono truncate">{shareUrl}</div>
            <button onClick={copyLink}
              className="text-xs bg-success/20 hover:bg-success/30 text-success px-3 py-1.5 rounded-lg font-semibold transition-colors flex-shrink-0">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}

        {/* ── Upload zone ───────────────────────────────────────── */}
        {uploadOpen && (
          <div
            className="mx-5 my-4 border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-accent/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
          >
            <div className="text-3xl mb-2">📸</div>
            <div className="text-sm font-semibold text-text-primary">Drop photos here or click to upload</div>
            <div className="text-xs text-muted mt-1">JPG, PNG, WEBP, MP4 · Max 10GB per file</div>
            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" className="hidden"
              onChange={e => handleFiles(e.target.files)} />
          </div>
        )}

        {/* ── Active uploads ────────────────────────────────────── */}
        {activeUploads.length > 0 && (
          <div className="px-5 pb-3 space-y-2">
            {activeUploads.map(u => (
              <div key={u.id} className="bg-bg border border-border rounded-xl px-4 py-2.5">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-text-primary truncate max-w-xs">{u.file.name}</span>
                  <span className={u.status === 'error' ? 'text-red-500' : 'text-muted'}>
                    {u.status === 'error' ? (u.error ?? 'Error') : u.status === 'uploading' ? `${u.progress}%` : 'Queued'}
                  </span>
                </div>
                {u.status === 'uploading' && (
                  <div className="h-1 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${u.progress}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Photo grid ────────────────────────────────────────── */}
        <div className="px-5 pb-5">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : files.length === 0 ? (
            <p className="text-xs text-muted text-center py-6">No photos yet — upload above to get started.</p>
          ) : (
            <>
              {/* Grid toolbar */}
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted">{files.length} photos</span>
                  {selectedCount > 0 && (
                    <span className="text-xs font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                      {selectedCount} selected
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {selectedCount > 0 && (
                    <>
                      <button onClick={() => setGridSelected(new Set())}
                        className="text-xs text-muted hover:text-text-primary border border-border px-2 py-1 rounded-lg hover:bg-border/40 transition-colors">
                        Clear
                      </button>
                      <button onClick={() => setDeleteMode('selected')}
                        className="text-xs text-red-500 border border-red-500/30 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors">
                        Delete {selectedCount}
                      </button>
                    </>
                  )}
                  <button onClick={() => setGridSelected(new Set(files.map(f => f.fileId)))}
                    className="text-xs text-muted hover:text-text-primary border border-border px-2 py-1 rounded-lg hover:bg-border/40 transition-colors">
                    Select All
                  </button>
                  <button onClick={() => setDeleteMode('all')}
                    className="text-xs text-red-500/60 hover:text-red-500 border border-border px-2 py-1 rounded-lg hover:border-red-500/30 hover:bg-red-500/5 transition-colors">
                    Delete All
                  </button>
                  {/* Zoom slider */}
                  <div className="flex items-center gap-1 ml-1">
                    <svg className="w-3 h-3 text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                    <input
                      type="range" min={2} max={10} value={zoomLevel}
                      onChange={e => setZoomLevel(Number(e.target.value))}
                      className="w-20 h-1 cursor-pointer accent-accent"
                    />
                    <svg className="w-3.5 h-3.5 text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Drag hint */}
              {selectedCount === 0 && (
                <p className="text-[10px] text-muted/60 mb-2">Click to select · Drag on empty space to select multiple</p>
              )}

              {/* Grid */}
              <div
                ref={gridRef}
                className="relative select-none"
                style={{ display: 'grid', gridTemplateColumns: `repeat(${zoomLevel}, minmax(0, 1fr))`, gap: '5px' }}
                onMouseDown={handleGridMouseDown}
              >
                {files.map(f => {
                  const isSelected = gridSelected.has(f.fileId)
                  const isFailed   = !['PROCESSING', 'READY'].includes(f.processingStatus)

                  return (
                    <div
                      key={f.fileId}
                      data-fileid={f.fileId}
                      onClick={() => togglePhoto(f.fileId)}
                      className={`relative aspect-square rounded-lg overflow-hidden bg-card border cursor-pointer transition-all duration-100
                        ${isSelected
                          ? 'border-accent ring-2 ring-accent/40 scale-[0.95]'
                          : 'border-border hover:border-border/60'}`}
                    >
                      {/* Image / placeholder */}
                      {f.r2PreviewUrl ? (
                        <img
                          src={f.r2PreviewUrl}
                          alt={f.originalFilename}
                          className="w-full h-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {f.processingStatus === 'PROCESSING'
                            ? <div className="w-4 h-4 border-2 border-muted border-t-transparent rounded-full animate-spin" />
                            : <span className="text-muted text-lg">📄</span>}
                        </div>
                      )}

                      {/* Processing overlay on top of preview */}
                      {f.processingStatus === 'PROCESSING' && f.r2PreviewUrl && (
                        <div className="absolute inset-0 bg-bg/50 flex items-center justify-center">
                          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}

                      {/* Failed state */}
                      {isFailed && (
                        <div className="absolute inset-0 bg-red-950/80 flex flex-col items-center justify-center gap-1.5 p-1">
                          <span className="text-red-400 text-base">⚠</span>
                          <span className="text-red-400 text-[9px] font-bold uppercase tracking-wide">Failed</span>
                          <button
                            onClick={e => { e.stopPropagation(); deleteFiles([f.fileId]) }}
                            className="text-[9px] text-red-300 border border-red-500/50 px-1.5 py-0.5 rounded hover:bg-red-500/30 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      )}

                      {/* Selection checkmark */}
                      {isSelected && (
                        <div className="absolute top-1 left-1 w-4 h-4 bg-accent rounded-full flex items-center justify-center shadow">
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Rubber-band drag overlay */}
                {dragRect && (
                  <div
                    className="absolute pointer-events-none border border-accent/70 bg-accent/10 rounded z-10"
                    style={{
                      left: dragRect.left, top: dragRect.top,
                      width: dragRect.width, height: dragRect.height,
                    }}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
