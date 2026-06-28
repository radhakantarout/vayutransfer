'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { StudioProject, MediaFile, Selection } from '@/types/studio'
import EditEventModal from './EditEventModal'

const CHUNK_SIZE = 50 * 1024 * 1024

interface UploadItem {
  id: string; file: File; progress: number; uploadedBytes: number
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

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function fmtEta(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
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
  const [uploadOpen, setUploadOpen]       = useState(false)
  const [uploadExpanded, setUploadExpanded] = useState(false)
  const [uploadSpeed, setUploadSpeed]       = useState(0)

  // Photo grid
  const [zoomLevel, setZoomLevel]       = useState(6)
  const [gridSelected, setGridSelected] = useState<Set<string>>(new Set())
  const [deleteMode, setDeleteMode]     = useState<DeleteMode>(null)
  const [deleting, setDeleting]         = useState(false)
  const [dragRect, setDragRect]         = useState<{ left: number; top: number; width: number; height: number } | null>(null)

  // Client selection filter
  type ClientSel = { selection: Selection; file: MediaFile }
  const [clientSelections, setClientSelections] = useState<ClientSel[] | null>(null)
  const [selLoading, setSelLoading]             = useState(false)
  const [viewFilter, setViewFilter]             = useState<'all' | 'loved' | 'edit'>('all')

  // Generate Previews (backfill R2)
  const [backfilling, setBackfilling]     = useState(false)
  const [backfillMsg, setBackfillMsg]     = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const gridRef      = useRef<HTMLDivElement>(null)
  const dragState    = useRef<{ active: boolean; startX: number; startY: number; moved: boolean }>({
    active: false, startX: 0, startY: 0, moved: false,
  })
  const speedRef = useRef<{ bytes: number; time: number }>({ bytes: 0, time: 0 })

  const loadFiles = useCallback(async () => {
    const res = await fetch(`/studio/api/admin/projects/${project.projectId}/files`).then(r => r.json())
    if (res.success) setFiles(res.data)
    setLoading(false)
  }, [project.projectId])

  useEffect(() => { loadFiles() }, [loadFiles])

  useEffect(() => { if (!loading && files.length === 0) setUploadOpen(true) }, [loading, files.length])

  // Upload speed tracking
  useEffect(() => {
    const hasActive = uploads.some(u => u.status === 'uploading')
    if (!hasActive) { speedRef.current = { bytes: 0, time: 0 }; setUploadSpeed(0); return }
    const currentBytes = uploads.reduce((s, u) => s + u.uploadedBytes, 0)
    const now = Date.now()
    if (speedRef.current.time === 0) { speedRef.current = { bytes: currentBytes, time: now }; return }
    const elapsed = (now - speedRef.current.time) / 1000
    if (elapsed >= 0.5) {
      setUploadSpeed(Math.max(0, (currentBytes - speedRef.current.bytes) / elapsed))
      speedRef.current = { bytes: currentBytes, time: now }
    }
  }, [uploads])

  // Auto-dismiss upload panel 3s after all files finish
  useEffect(() => {
    if (uploads.length === 0) return
    const allDone = uploads.every(u => u.status === 'done' || u.status === 'error')
    if (!allDone) return
    const t = setTimeout(() => { setUploads([]); setUploadExpanded(false) }, 3000)
    return () => clearTimeout(t)
  }, [uploads])

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

  const loadSelections = async () => {
    if (clientSelections !== null) return
    setSelLoading(true)
    const res = await fetch(`/studio/api/admin/projects/${project.projectId}/selections`).then(r => r.json())
    if (res.success) setClientSelections(res.data)
    setSelLoading(false)
  }

  const toggleFilter = async (filter: 'loved' | 'edit') => {
    if (viewFilter === filter) { setViewFilter('all'); return }
    await loadSelections()
    setViewFilter(filter)
  }

  const generatePreviews = async () => {
    setBackfilling(true)
    setBackfillMsg(null)
    try {
      const res = await fetch(
        `/studio/api/admin/projects/${project.projectId}/backfill-previews`,
        { method: 'POST' }
      ).then(r => r.json())
      if (res.success) {
        const { queued, message } = res.data
        setBackfillMsg(queued === 0 ? '✓ All previews up to date' : `✓ Generating ${queued} previews…`)
        if (queued > 0) setTimeout(loadFiles, 8000)
      } else {
        setBackfillMsg('Failed to queue previews')
      }
    } catch {
      setBackfillMsg('Network error')
    }
    setBackfilling(false)
    setTimeout(() => setBackfillMsg(null), 5000)
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
        update({ progress: Math.round(((i + 1) / partCount) * 100), uploadedBytes: Math.min((i + 1) * CHUNK_SIZE, file.size) })
      }
      const completeRes = await fetch(`/studio/api/admin/projects/${project.projectId}/upload-complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, uploadId, parts }),
      }).then(r => r.json())
      if (!completeRes.success) throw new Error(completeRes.message ?? 'Complete failed')
      update({ status: 'done', progress: 100, uploadedBytes: file.size })
      loadFiles(); onUpdated()
    } catch (err) {
      update({ status: 'error', error: err instanceof Error ? err.message : 'Upload failed' })
    }
  }

  const handleFiles = (selected: FileList | null) => {
    if (!selected) return
    const items: UploadItem[] = Array.from(selected).map(f => ({
      id: crypto.randomUUID(), file: f, progress: 0, status: 'queued' as const, uploadedBytes: 0,
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

  const lovedCount = clientSelections?.length ?? null
  const editCount  = clientSelections?.filter(s => s.selection.editingRequired).length ?? null

  const displayFiles: MediaFile[] = (() => {
    if (viewFilter === 'all' || !clientSelections) return files
    if (viewFilter === 'loved') return clientSelections.map(s => s.file)
    return clientSelections.filter(s => s.selection.editingRequired).map(s => s.file)
  })()

  const editCommentMap: Map<string, string> = viewFilter === 'edit' && clientSelections
    ? new Map(clientSelections.filter(s => s.selection.editingRequired && s.selection.comment).map(s => [s.file.fileId, s.selection.comment!]))
    : new Map()

  const selectedCount   = gridSelected.size
  const deleteTargetIds = deleteMode === 'all' ? displayFiles.map(f => f.fileId) : Array.from(gridSelected)

  // How many files in the delete batch were finalized by the client
  const clientFinalizedInBatch = clientSelections
    ? deleteTargetIds.filter(id => clientSelections.some(s => s.file.fileId === id && s.selection.isSelected)).length
    : 0

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
              <div className="text-4xl mb-3">{clientFinalizedInBatch > 0 ? '⚠️' : '🗑️'}</div>
              <h3 className="text-base font-bold text-text-primary">
                {deleteMode === 'all'
                  ? `Delete all ${files.length} photos?`
                  : `Delete ${selectedCount} photo${selectedCount !== 1 ? 's' : ''}?`}
              </h3>
              {clientFinalizedInBatch > 0 ? (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-yellow-400 font-semibold bg-yellow-400/10 border border-yellow-400/20 rounded-xl px-3 py-2">
                    {clientFinalizedInBatch === deleteTargetIds.length
                      ? `Client has finalized ${clientFinalizedInBatch === 1 ? 'this photo' : `all ${clientFinalizedInBatch} photos`} in their selection.`
                      : `${clientFinalizedInBatch} of these photo${clientFinalizedInBatch !== 1 ? 's were' : ' was'} finalized by the client.`}
                  </p>
                  <p className="text-xs text-muted">Deleting will permanently remove them from the gallery and the client&apos;s selection.</p>
                </div>
              ) : (
                <p className="text-xs text-muted mt-1.5">This cannot be undone. Photos will be permanently removed from this event.</p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteMode(null)} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text-primary hover:bg-border/40 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={() => deleteFiles(deleteTargetIds)} disabled={deleting}
                className={`flex-1 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-60 transition-colors
                  ${clientFinalizedInBatch > 0 ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-red-600 hover:bg-red-700'}`}>
                {deleting ? 'Deleting…' : clientFinalizedInBatch > 0 ? 'Yes, Delete Anyway' : 'Delete'}
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
              <>
                {/* Loved photos filter */}
                <button
                  onClick={() => toggleFilter('loved')}
                  disabled={selLoading}
                  title="View photos loved by client"
                  className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors
                    ${viewFilter === 'loved'
                      ? 'bg-rose-500 text-white shadow-sm'
                      : 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20'}`}
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z"/>
                  </svg>
                  {lovedCount !== null ? lovedCount : selLoading ? '…' : ''}
                </button>

                {/* Edit-required filter */}
                <button
                  onClick={() => toggleFilter('edit')}
                  disabled={selLoading}
                  title="View photos needing edits"
                  className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors
                    ${viewFilter === 'edit'
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'bg-orange-500/10 text-orange-500 hover:bg-orange-500/20'}`}
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  {editCount !== null ? editCount : selLoading ? '…' : ''}
                </button>
              </>
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
            {/* Generate Previews (R2 backfill) */}
            <button
              onClick={generatePreviews}
              disabled={backfilling}
              title={backfillMsg ?? 'Generate/update R2 previews for all photos'}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted hover:text-accent hover:border-accent/40 hover:bg-accent/10 disabled:opacity-40 transition-colors relative"
            >
              {backfilling ? (
                <div className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 9.75h.008v.008H3V9.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm13.5 0h.008v.008h-.008V9.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM9 3.75h6.75a3 3 0 013 3v10.5a3 3 0 01-3 3H5.25a3 3 0 01-3-3V6.75a3 3 0 013-3H9z" />
                </svg>
              )}
            </button>
            {/* Toast message for backfill status */}
            {backfillMsg && (
              <span className="text-[10px] text-muted font-medium">{backfillMsg}</span>
            )}
            <button onClick={() => setEditOpen(true)} title="Edit event"
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted hover:text-accent hover:border-accent/40 hover:bg-accent/10 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Tab navigation ────────────────────────────────────── */}
        <div className="flex items-center gap-0 border-b border-border px-5">
          <span className="text-xs font-semibold px-3 py-2.5 border-b-2 border-accent text-accent">
            All Photos
          </span>
          <Link
            href={`/studio/dashboard/projects/${project.projectId}/faces`}
            className="text-xs font-semibold px-3 py-2.5 border-b-2 border-transparent text-muted hover:text-text-primary hover:border-border transition-colors"
          >
            Face Index ✨
          </Link>
          <Link
            href={`/studio/dashboard/projects/${project.projectId}/selections`}
            className="text-xs font-semibold px-3 py-2.5 border-b-2 border-transparent text-muted hover:text-text-primary hover:border-border transition-colors"
          >
            Selections
          </Link>
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

        {/* ── Upload progress ───────────────────────────────────── */}
        {uploads.length > 0 && (() => {
          const totalFiles  = uploads.length
          const doneFiles   = uploads.filter(u => u.status === 'done').length
          const errFiles    = uploads.filter(u => u.status === 'error').length
          const totalBytes  = uploads.reduce((s, u) => s + u.file.size, 0)
          const sentBytes   = uploads.reduce((s, u) => s + u.uploadedBytes, 0)
          const overallPct  = totalBytes > 0 ? Math.round((sentBytes / totalBytes) * 100) : 0
          const allDone     = doneFiles + errFiles === totalFiles
          const eta         = uploadSpeed > 0 && !allDone ? (totalBytes - sentBytes) / uploadSpeed : 0
          return (
            <div className="px-5 pb-3 space-y-2">
              {/* Summary card */}
              <div className="bg-bg border border-border rounded-xl px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-text-primary">
                    {allDone
                      ? `${doneFiles} file${doneFiles !== 1 ? 's' : ''} uploaded${errFiles > 0 ? ` · ${errFiles} failed` : ' ✓'}`
                      : `Uploading ${doneFiles + 1} of ${totalFiles} file${totalFiles !== 1 ? 's' : ''}`}
                  </span>
                  <button
                    onClick={() => setUploadExpanded(v => !v)}
                    className="flex items-center gap-1 text-xs text-muted hover:text-text-primary transition-colors flex-shrink-0"
                  >
                    <svg className={`w-3 h-3 transition-transform duration-200 ${uploadExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    Details
                  </button>
                </div>

                {!allDone && (
                  <div className="h-1.5 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${overallPct}%` }} />
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{fmtBytes(sentBytes)} / {fmtBytes(totalBytes)}</span>
                  <div className="flex items-center gap-3">
                    {!allDone && uploadSpeed > 0 && (
                      <span>{fmtBytes(uploadSpeed)}/s{eta > 0 ? ` · ${fmtEta(eta)} left` : ''}</span>
                    )}
                    {!allDone && <span>{overallPct}%</span>}
                  </div>
                </div>
              </div>

              {/* Per-file details (expandable) */}
              {uploadExpanded && (
                <div className="space-y-1.5">
                  {uploads.map(u => (
                    <div key={u.id} className="bg-bg border border-border rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-text-primary truncate max-w-[240px]">{u.file.name}</span>
                        <span className={`ml-2 flex-shrink-0 font-medium ${u.status === 'error' ? 'text-red-500' : u.status === 'done' ? 'text-success' : 'text-muted'}`}>
                          {u.status === 'error' ? (u.error ?? 'Error') : u.status === 'done' ? '✓ Done' : u.status === 'uploading' ? `${u.progress}%` : 'Queued'}
                        </span>
                      </div>
                      {u.status === 'uploading' && (
                        <div className="h-0.5 bg-border rounded-full overflow-hidden">
                          <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${u.progress}%` }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

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
              {/* Active filter banner */}
              {viewFilter !== 'all' && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold mb-3
                  ${viewFilter === 'loved' ? 'bg-rose-500/10 text-rose-500' : 'bg-orange-500/10 text-orange-500'}`}>
                  {viewFilter === 'loved'
                    ? <><svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z"/></svg> Loved by client</>
                    : <><svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg> Needs editing</>}
                  <span className="font-normal text-current/70">— {displayFiles.length} photo{displayFiles.length !== 1 ? 's' : ''}</span>
                  <button onClick={() => setViewFilter('all')}
                    className="ml-auto font-normal opacity-60 hover:opacity-100 transition-opacity">
                    Clear ×
                  </button>
                </div>
              )}

              {/* Grid toolbar */}
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted">
                    {viewFilter !== 'all' ? `${displayFiles.length} of ${files.length}` : `${files.length}`} photos
                  </span>
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
                  <button onClick={() => setGridSelected(new Set(displayFiles.map(f => f.fileId)))}
                    className="text-xs text-muted hover:text-text-primary border border-border px-2 py-1 rounded-lg hover:bg-border/40 transition-colors">
                    Select All
                  </button>
                  <button onClick={() => setDeleteMode('all')}
                    className="text-xs text-red-500/60 hover:text-red-500 border border-border px-2 py-1 rounded-lg hover:border-red-500/30 hover:bg-red-500/5 transition-colors">
                    Delete All
                  </button>
                  {/* Zoom slider */}
                  <div className="flex items-center gap-1 ml-1">
                    <button onClick={() => setZoomLevel(v => Math.min(10, v + 1))} title="Zoom out"
                      className="w-5 h-5 flex items-center justify-center rounded text-muted hover:text-text-primary hover:bg-border/60 transition-colors flex-shrink-0">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" />
                      </svg>
                    </button>
                    <input
                      type="range" min={2} max={10} value={zoomLevel}
                      onChange={e => setZoomLevel(Number(e.target.value))}
                      className="w-20 h-1 cursor-pointer accent-accent"
                    />
                    <button onClick={() => setZoomLevel(v => Math.max(2, v - 1))} title="Zoom in"
                      className="w-5 h-5 flex items-center justify-center rounded text-muted hover:text-text-primary hover:bg-border/60 transition-colors flex-shrink-0">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Drag hint */}
              {selectedCount === 0 && viewFilter === 'all' && (
                <p className="text-[10px] text-muted/60 mb-2">Click to select · Drag on empty space to select multiple</p>
              )}

              {/* Grid */}
              <div className="vayu-scroll overflow-y-auto rounded-xl" style={{ maxHeight: '520px' }}>
              <div
                ref={gridRef}
                className="relative select-none"
                style={{ display: 'grid', gridTemplateColumns: `repeat(${zoomLevel}, minmax(0, 1fr))`, gap: '5px' }}
                onMouseDown={handleGridMouseDown}
              >
                {displayFiles.map(f => {
                  const isSelected = gridSelected.has(f.fileId)
                  const isFailed   = !['PROCESSING', 'READY'].includes(f.processingStatus)
                  const editComment = editCommentMap.get(f.fileId)

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

                      {/* Edit comment tooltip (only in edit filter view) */}
                      {editComment && (
                        <div className="absolute bottom-0 inset-x-0 bg-orange-900/90 px-1.5 py-1 text-[8px] text-orange-200 leading-tight line-clamp-2">
                          {editComment}
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
              </div>{/* end scroll wrapper */}
            </>
          )}
        </div>
      </div>
    </>
  )
}
