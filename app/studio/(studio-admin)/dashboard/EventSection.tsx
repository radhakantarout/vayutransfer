'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'
import QRCode from 'qrcode'
import type { StudioProject, MediaFile, Selection, StudioTransfer, CurationStatus } from '@/types/studio'
import { useExpandedGrid } from '@/components/studio/ExpandedGridContext'
import { loadUploadResume, saveUploadResume, clearUploadResume } from '@/lib/studio/uploadResume'
import { CHUNK_SIZE, uploadFileInChunks, fetchWithTimeout, runWithConcurrencyLimit, type PartRecord } from '@/lib/studio/clientUpload'
import PhotoActionsMenu, { type PhotoMenuAction } from '@/components/studio/PhotoActionsMenu'
import MoveCopyPhotoModal from '@/components/studio/MoveCopyPhotoModal'
import PhotoScopeIcon from '@/components/studio/PhotoScopeIcon'
import { PHOTO_SCOPE_LABEL, PHOTO_SCOPE_ORDER, resolveScopeFileIds, type PhotoScope } from '@/lib/studio/photoScope'

// At most this many files upload at once — selecting hundreds/thousands of
// files and firing them all simultaneously overwhelms both the browser's
// connection pool and the backend (each one does its own multipart-initiate
// + N part PUTs + complete), which is what let large batches silently stall
// past a few hundred files with no error ever surfacing.
const MAX_CONCURRENT_UPLOADS = 4
// A file record sits at 'UPLOADING' for the first several seconds of any
// legitimate upload — only treat it as genuinely stuck once it's been that
// long with no progress, so slow-but-working uploads aren't misclassified.
const STALE_UPLOAD_MS = 15 * 60 * 1000

interface UploadItem {
  id: string; file: File; progress: number; uploadedBytes: number
  status: 'queued' | 'uploading' | 'done' | 'error'; error?: string
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
    const statusRes = await fetchWithTimeout(
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

  const initRes = await fetchWithTimeout(`/studio/api/admin/projects/${projectId}/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size, partCount }),
  }).then((r) => r.json())
  if (!initRes.success) throw new Error(initRes.message ?? 'Upload init failed')
  const { fileId, uploadId, presignedUrls } = initRes.data
  saveUploadResume({ projectId, fileId, uploadId, filename: file.name, size: file.size, lastModified: file.lastModified })
  return { fileId, uploadId, presignedUrls, completedParts: [] }
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

type SortMode = 'DEFAULT' | 'NAME_ASC' | 'NAME_DESC' | 'DATE_OLD' | 'DATE_NEW' | 'SIZE_LARGE' | 'SIZE_SMALL'
const SORT_LABEL: Record<SortMode, string> = {
  DEFAULT:     'Default order',
  NAME_ASC:    'Name (A–Z)',
  NAME_DESC:   'Name (Z–A)',
  DATE_OLD:    'Oldest first',
  DATE_NEW:    'Newest first',
  SIZE_LARGE:  'Size (largest first)',
  SIZE_SMALL:  'Size (smallest first)',
}
function sortFiles(files: MediaFile[], mode: SortMode): MediaFile[] {
  if (mode === 'DEFAULT') return files
  const arr = [...files]
  switch (mode) {
    case 'NAME_ASC':   arr.sort((a, b) => (a.originalFilename ?? '').localeCompare(b.originalFilename ?? '')); break
    case 'NAME_DESC':  arr.sort((a, b) => (b.originalFilename ?? '').localeCompare(a.originalFilename ?? '')); break
    case 'DATE_OLD':   arr.sort((a, b) => (a.uploadedAt ?? '').localeCompare(b.uploadedAt ?? '')); break
    case 'DATE_NEW':   arr.sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? '')); break
    case 'SIZE_LARGE':  arr.sort((a, b) => b.sizeBytes - a.sizeBytes); break
    case 'SIZE_SMALL':  arr.sort((a, b) => a.sizeBytes - b.sizeBytes); break
  }
  return arr
}

type DeleteMode = 'selected' | 'all' | null
type ActiveTab  = 'photos' | 'faces' | 'selections' | 'transfers'

interface FaceStatus {
  totalPhotos: number; indexedPhotos: number; pendingPhotos: number
  activeJob: { jobId: string; status: string } | null; lastCompletedAt: string | null
}
type SelectionItem = { selection: Selection; file: MediaFile }
interface EditUploadState {
  status: 'idle' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
}

interface Props {
  project: StudioProject
  onUpdated: () => void
  // Cross-event selection (controlled from layout) — single-project shape,
  // used as-is when only one project is open at all.
  selectedIds: Set<string>
  onSelectionChange: (ids: Set<string>) => void
  onFilesLoaded: (files: MediaFile[]) => void
  refreshTrigger?: number
  hidePill?: boolean
  triggerShare?: boolean
  onShareTriggered?: () => void
  // Grid zoom + grid/list view mode — controlled from layout so both stay in
  // sync across every event section open at once (multi-select view). The
  // floating zoom bar itself is rendered once, by layout.tsx, not per-event
  // (rendering it here per-instance would stack duplicate fixed-position
  // widgets on top of each other when multiple events are open).
  zoomLevel: number
  viewMode: 'grid' | 'list'
  onViewModeChange: (mode: 'grid' | 'list') => void
  // Project-level actions ("...") — same handlers already used by the
  // sidebar's per-event menu, just surfaced here too when a project is open.
  onEditProject?: (p: StudioProject) => void
  onQuickShare?: (projects: StudioProject[]) => void
  onAISort?: (projects: StudioProject[]) => void
  onDeleteProject?: (projects: StudioProject[]) => void
  // Closes this event entirely (clears sidebar selection) — the small ×
  // next to the "..." menu, replacing the old separate "Clear" bar.
  onClose?: () => void
  // Multi-event mode: when 2+ projects are selected in the sidebar, this
  // SAME EventSection (not a different-looking component) merges their
  // "All Photos" into one grid instead of stacking a section per project.
  // `project` above stays the "host" (its header/tabs/Face-Index/Selections/
  // Raw-Transfers are always about the host only — those are inherently
  // single-project concepts and don't merge). Only the All Photos grid
  // pulls from every checked entry here.
  photoSourceProjects?: StudioProject[]
  photoSelectionsMap?: Map<string, Set<string>>
  onPhotoSelectionChange?: (projectId: string) => (ids: Set<string>) => void
  onFilesLoadedFor?: (projectId: string) => (files: MediaFile[]) => void
  // Lets a parent-level bulk action (the global selection pill's star
  // toggle) patch curationStatus straight into this component's own `files`
  // state instantly, instead of waiting on a full loadFiles() re-fetch —
  // `token` must change on every dispatch (even repeats) so the effect fires.
  externalCurationUpdate?: { fileIds: string[]; curationStatus: CurationStatus | undefined; token: number } | null
}

interface NotificationItem {
  jobId: string
  jobType: string
  projectId: string
  completedAt: string
}

export default function EventSection({
  project, onUpdated,
  selectedIds: selectedIdsProp, onSelectionChange: onSelectionChangeProp,
  onFilesLoaded, refreshTrigger, hidePill, triggerShare, onShareTriggered,
  zoomLevel, viewMode, onViewModeChange: setViewMode,
  onEditProject, onQuickShare, onAISort, onDeleteProject, onClose,
  photoSourceProjects, photoSelectionsMap, onPhotoSelectionChange, onFilesLoadedFor,
  externalCurationUpdate,
}: Props) {
  const pathname = usePathname()

  // ── Multi-event photo sources ───────────────────────────────
  // Which events contribute photos to the All Photos grid — always every
  // event currently checked in the sidebar (that checkbox list is the only
  // selection mechanism now; there used to be a second, redundant checkbox
  // dropdown here that just duplicated it).
  const isMultiSource = (photoSourceProjects?.length ?? 0) > 1
  const activeSourceProjects = photoSourceProjects ?? [project]

  // ── Photo grid ────────────────────────────────────────────
  const [files, setFiles]           = useState<MediaFile[]>([])
  const [loading, setLoading]       = useState(true)
  const [uploads, setUploads]       = useState<UploadItem[]>([])
  const [shareUrl, setShareUrl]     = useState<string | null>(null)
  const [sharing, setSharing]       = useState(false)
  const [copied, setCopied]         = useState(false)
  const [showShareSetup, setShowShareSetup] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [selMin, setSelMin]         = useState(project.selectionMin ?? 0)
  const [selMax, setSelMax]         = useState(project.selectionMax ?? 0)
  const [uploadOpen, setUploadOpen]       = useState(false)
  const [uploadExpanded, setUploadExpanded] = useState(false)
  const [uploadSpeed, setUploadSpeed]       = useState(0)
  const [sortMode, setSortMode]         = useState<SortMode>('DEFAULT')
  const [expanded, setExpanded]         = useState(false)
  const [deleteMode, setDeleteMode]     = useState<DeleteMode>(null)
  const [deleting, setDeleting]         = useState(false)
  const [deleteError, setDeleteError]   = useState<string | null>(null)
  const [renamingFile, setRenamingFile] = useState<MediaFile | null>(null)
  const [renameValue, setRenameValue]   = useState('')
  const [renameSaving, setRenameSaving] = useState(false)
  const [moveCopyTarget, setMoveCopyTarget] = useState<{ mode: 'copy' | 'move'; file: MediaFile } | null>(null)
  const [settingCoverId, setSettingCoverId] = useState<string | null>(null)
  const [bulkWatermarking, setBulkWatermarking] = useState(false)
  const [bulkAISorting, setBulkAISorting] = useState(false)
  const [dragRect, setDragRect]         = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [searchQuery, setSearchQuery]   = useState('')
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [showNotif, setShowNotif]       = useState(false)

  // Client selection filter (loaded on demand — only CLIENT_FAVORITE/EDIT_REQUIRED need it)
  type ClientSel = { selection: Selection; file: MediaFile }
  const [clientSelections, setClientSelections] = useState<ClientSel[] | null>(null)
  const [selLoading, setSelLoading]             = useState(false)
  const [viewFilter, setViewFilter]             = useState<PhotoScope>('ALL')

  // ── Tabs ─────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (pathname.endsWith('/faces'))      return 'faces'
    if (pathname.endsWith('/selections')) return 'selections'
    if (pathname.endsWith('/transfers'))  return 'transfers'
    return 'photos'
  })

  // ── Face Index tab ────────────────────────────────────────
  const [faceStatus, setFaceStatus]         = useState<FaceStatus | null>(null)
  const [faceLoading, setFaceLoading]       = useState(false)
  const [faceTriggering, setFaceTriggering] = useState(false)
  const [faceError, setFaceError]           = useState<string | null>(null)
  const [faceFeatureOff, setFaceFeatureOff] = useState(false)
  const [qrExpiry, setQrExpiry]           = useState<12 | 24 | 48>(24)
  const [qrGenerating, setQrGenerating]   = useState(false)
  const [qrDataUrl, setQrDataUrl]         = useState<string | null>(null)
  const [qrGuestUrl, setQrGuestUrl]       = useState<string | null>(null)
  const [qrExpiresAt, setQrExpiresAt]     = useState<string | null>(null)
  const [qrCopied, setQrCopied]           = useState(false)

  // ── Selections tab ────────────────────────────────────────
  const [selItems, setSelItems]               = useState<SelectionItem[] | null>(null)
  const [selItemsLoading, setSelItemsLoading] = useState(false)
  const [printUrl, setPrintUrl]               = useState<string | null>(null)
  const [printCopied, setPrintCopied]         = useState(false)
  const [printGenerating, setPrintGenerating] = useState(false)
  const [printBlockedMessage, setPrintBlockedMessage] = useState<string | null>(null)
  const [editUploadStates, setEditUploadStates] = useState<Map<string, EditUploadState>>(new Map())
  const editFileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const needsEditingRef   = useRef<HTMLDivElement>(null)

  // ── Raw Transfers tab ──────────────────────────────────────
  const [transfers, setTransfers]           = useState<StudioTransfer[] | null>(null)
  const [transfersLoading, setTransfersLoading] = useState(false)
  const [transfersError, setTransfersError] = useState<string | null>(null)
  const [transfersBusyId, setTransfersBusyId] = useState<string | null>(null)
  const [transferCopiedId, setTransferCopiedId] = useState<string | null>(null)
  const [requestingTransfer, setRequestingTransfer] = useState(false)
  const [sendTransferProgress, setSendTransferProgress] = useState<{ filename: string; percent: number } | null>(null)
  const transferFileInputRef = useRef<HTMLInputElement>(null)

  // ── Admin photo preview (lightbox) ─────────────────────────
  // 'selected' = the floating-pill "Preview" flow (only currently-selected
  // photos, existing behavior). 'all' = opened via a single tile's "Open"
  // menu action — browses every visible photo in the grid, not just a
  // selection.
  const [showAdminPreview, setShowAdminPreview] = useState(false)
  const [previewMode, setPreviewMode]           = useState<'selected' | 'all'>('selected')
  const [adminPreviewIdx, setAdminPreviewIdx]   = useState(0)
  const [showPhotoInfo, setShowPhotoInfo]       = useState(false)
  // No backend field for image dimensions — read it client-side once the
  // full-size image actually loads in the lightbox, free, no new API call.
  const [previewImgDims, setPreviewImgDims]     = useState<{ width: number; height: number } | null>(null)
  const adminTouchStartX = useRef<number>(0)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const gridRef      = useRef<HTMLDivElement>(null)
  const notifRef     = useRef<HTMLDivElement>(null)
  const dragState    = useRef<{ active: boolean; startX: number; startY: number; moved: boolean }>({
    active: false, startX: 0, startY: 0, moved: false,
  })
  // A genuine drag can start and end on the same tile (e.g. a diagonal
  // gesture that curls back), which would otherwise also fire that tile's
  // own click and toggle it — on top of whatever the rubber-band selected.
  // Set the instant a real drag completes, consumed by the next tile click.
  const suppressNextTileClickRef = useRef(false)
  const speedRef = useRef<{ bytes: number; time: number }>({ bytes: 0, time: 0 })

  // ── Files ─────────────────────────────────────────────────
  // Every MediaFile already carries its own projectId (the table's real PK),
  // so merging multiple source projects' files into one array needs no
  // client-side tagging — actions just read f.projectId instead of assuming
  // the host project.
  const activeSourceProjectIds = activeSourceProjects.map(p => p.projectId).join(',')
  const loadFiles = useCallback(async () => {
    const sources = isMultiSource ? activeSourceProjects : [project]
    const results = await Promise.all(
      sources.map(p =>
        fetch(`/studio/api/admin/projects/${p.projectId}/files`).then(r => r.json())
          .then(d => ({ projectId: p.projectId, files: (d.success ? d.data : []) as MediaFile[] }))
      )
    )
    const merged = results.flatMap(r => r.files)
    setFiles(merged)
    if (isMultiSource) {
      results.forEach(({ projectId, files }) => onFilesLoadedFor?.(projectId)(files))
    } else {
      onFilesLoaded(merged)
    }
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.projectId, isMultiSource, activeSourceProjectIds])

  useEffect(() => { loadFiles() }, [loadFiles, refreshTrigger])

  // Applies a parent-dispatched bulk curationStatus patch straight to this
  // component's own files — instant UI feedback for the global selection
  // pill's star toggle, no full reload needed. Runs off `token` (not the
  // fileIds/status themselves) so a repeat dispatch always re-fires.
  useEffect(() => {
    if (!externalCurationUpdate) return
    const { fileIds, curationStatus } = externalCurationUpdate
    const idSet = new Set(fileIds)
    setFiles(prev => prev.map(f => idSet.has(f.fileId) ? { ...f, curationStatus } : f))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalCurationUpdate?.token])

  // ── Cross-project selection routing ─────────────────────────
  // projectIdOf: every action below operates on a fileId — look up which
  // project it actually belongs to (rather than assuming the host project)
  // so download/delete/watermark/rename/cover/curation/share all target the
  // right project even when the grid is showing merged multi-event photos.
  const projectIdOf = (fileId: string): string =>
    files.find(f => f.fileId === fileId)?.projectId ?? project.projectId

  const combinedSelectedIds: Set<string> = isMultiSource
    ? new Set(activeSourceProjects.flatMap(p => Array.from(photoSelectionsMap?.get(p.projectId) ?? [])))
    : selectedIdsProp

  const selectedIds = combinedSelectedIds

  const onSelectionChange = (next: Set<string>) => {
    if (!isMultiSource || !photoSelectionsMap || !onPhotoSelectionChange) {
      onSelectionChangeProp(next)
      return
    }
    const current = combinedSelectedIds
    const added   = Array.from(next).filter(id => !current.has(id))
    const removed = Array.from(current).filter(id => !next.has(id))
    const byProject = new Map<string, Set<string>>()
    activeSourceProjects.forEach(p => byProject.set(p.projectId, new Set(photoSelectionsMap.get(p.projectId) ?? [])))
    added.forEach(fid => {
      const pid = projectIdOf(fid)
      if (!byProject.has(pid)) byProject.set(pid, new Set())
      byProject.get(pid)!.add(fid)
    })
    removed.forEach(fid => { byProject.get(projectIdOf(fid))?.delete(fid) })
    byProject.forEach((set, pid) => onPhotoSelectionChange(pid)(set))
  }
  useEffect(() => { if (!loading && files.length === 0) setUploadOpen(true) }, [loading, files.length])

  // Notification bell — recently completed jobs (face indexing, AI sorting,
  // watermark backfill) for this project. Same existing /admin/notifications
  // route the "recent activity" concept already relies on elsewhere.
  useEffect(() => {
    const loadNotifications = () => {
      fetch(`/studio/api/admin/notifications?projectId=${project.projectId}`)
        .then(r => r.json())
        .then(d => { if (d?.success) setNotifications(d.data.notifications) })
        .catch(() => {})
    }
    loadNotifications()
    const interval = setInterval(loadNotifications, 60000)
    return () => clearInterval(interval)
  }, [project.projectId])

  useEffect(() => {
    if (!showNotif) return
    const onDocClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotif(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [showNotif])

  // Open share setup when triggered from global pill
  useEffect(() => {
    if (triggerShare) { setShowShareSetup(true); onShareTriggered?.() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerShare])

  // Escape closes fullscreen
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  // Tell the top-level layout to hide the navbar/chat widget while this grid
  // is fullscreen — covers both the toggle button and the Escape-key close
  // above, since both just flip local `expanded`. Also resets on unmount so
  // navigating away mid-expansion never leaves the navbar permanently hidden.
  const { setExpanded: setNavbarHidden } = useExpandedGrid()
  useEffect(() => {
    setNavbarHidden(expanded)
    return () => { if (expanded) setNavbarHidden(false) }
  }, [expanded, setNavbarHidden])

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

  useEffect(() => {
    if (uploads.length === 0) return
    const allDone = uploads.every(u => u.status === 'done' || u.status === 'error')
    if (!allDone) return
    const t = setTimeout(() => { setUploads([]); setUploadExpanded(false) }, 3000)
    return () => clearTimeout(t)
  }, [uploads])

  // Rubber-band drag select
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragState.current.active || !gridRef.current) return
      const gr = gridRef.current.getBoundingClientRect()
      const cx = e.clientX - gr.left; const cy = e.clientY - gr.top
      const { startX, startY } = dragState.current
      if (Math.abs(cx - startX) > 4 || Math.abs(cy - startY) > 4) dragState.current.moved = true
      if (!dragState.current.moved) return
      setDragRect({ left: Math.min(startX, cx), top: Math.min(startY, cy), width: Math.abs(cx - startX), height: Math.abs(cy - startY) })
    }
    const onUp = (e: MouseEvent) => {
      if (!dragState.current.active) return
      const { startX, startY, moved } = dragState.current
      dragState.current.active = false; dragState.current.moved = false; setDragRect(null)
      if (!moved || !gridRef.current) return
      suppressNextTileClickRef.current = true
      const gr = gridRef.current.getBoundingClientRect()
      const ex = e.clientX - gr.left; const ey = e.clientY - gr.top
      const selL = Math.min(startX, ex) + gr.left; const selT = Math.min(startY, ey) + gr.top
      const selR = Math.max(startX, ex) + gr.left; const selB = Math.max(startY, ey) + gr.top
      const toSelect = new Set<string>()
      gridRef.current.querySelectorAll('[data-fileid]').forEach(el => {
        const r = el.getBoundingClientRect()
        if (r.left < selR && r.right > selL && r.top < selB && r.bottom > selT)
          toSelect.add((el as HTMLElement).dataset.fileid!)
      })
      if (toSelect.size > 0) {
        const next = new Set(selectedIds)
        toSelect.forEach(id => next.add(id))
        onSelectionChange(next)
      }
    }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [selectedIds, onSelectionChange])

  // Only bail out of drag-select for actual interactive controls (the "⋯"
  // menu trigger, marked data-no-drag) — not the whole tile, which used to
  // exclude virtually all pixels given the grid's 5px gap left almost no
  // genuinely empty space to start a drag from.
  const handleGridMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('[data-no-drag]')) return
    const gr = gridRef.current!.getBoundingClientRect()
    dragState.current = { active: true, startX: e.clientX - gr.left, startY: e.clientY - gr.top, moved: false }
    e.preventDefault()
  }

  const handleTileClick = (fileId: string) => {
    if (suppressNextTileClickRef.current) { suppressNextTileClickRef.current = false; return }
    togglePhoto(fileId)
  }

  // ── Face Index functions ───────────────────────────────────
  const loadFaceStatus = useCallback(async () => {
    setFaceLoading(true); setFaceError(null)
    try {
      const res = await fetch(`/studio/api/admin/projects/${project.projectId}/faces`).then(r => r.json())
      if (res.success) setFaceStatus(res.data)
    } finally {
      setFaceLoading(false)
    }
  }, [project.projectId])

  // Poll while face job is active
  useEffect(() => {
    if (activeTab !== 'faces' || !faceStatus?.activeJob) return
    const t = setInterval(loadFaceStatus, 6000)
    return () => clearInterval(t)
  }, [activeTab, faceStatus?.activeJob, loadFaceStatus])

  const triggerFaceIndexing = async () => {
    setFaceTriggering(true); setFaceError(null)
    const res = await fetch(`/studio/api/admin/projects/${project.projectId}/faces/index`, { method: 'POST' }).then(r => r.json())
    setFaceTriggering(false)
    if (!res.success) {
      if (res.error === 'FEATURE_DISABLED') { setFaceFeatureOff(true); return }
      setFaceError(res.message ?? res.error); return
    }
    setFaceStatus(prev => prev ? { ...prev, activeJob: { jobId: res.data.jobId, status: 'PENDING' } } : prev)
  }

  const generateQr = async () => {
    setQrGenerating(true)
    const res = await fetch(`/studio/api/admin/projects/${project.projectId}/guest-token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiryHours: qrExpiry }),
    }).then(r => r.json())
    setQrGenerating(false)
    if (!res.success) { setFaceError(res.message ?? 'Could not generate QR code'); return }
    const { qrUrl, expiresAt } = res.data
    setQrGuestUrl(qrUrl); setQrExpiresAt(expiresAt)
    const dataUrl = await QRCode.toDataURL(qrUrl, { width: 280, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
    setQrDataUrl(dataUrl)
  }

  // ── Selections tab functions ───────────────────────────────
  const loadSelItems = useCallback(async () => {
    if (selItems !== null) return
    setSelItemsLoading(true)
    const res = await fetch(`/studio/api/admin/projects/${project.projectId}/selections`).then(r => r.json())
    if (res.success) setSelItems(res.data)
    setSelItemsLoading(false)
  }, [project.projectId, selItems])

  // ── Raw Transfers tab functions ────────────────────────────
  const loadTransfers = useCallback(async () => {
    setTransfersLoading(true)
    const res = await fetch(`/studio/api/admin/projects/${project.projectId}/transfers`).then(r => r.json())
    if (res.success) setTransfers(res.data.transfers)
    setTransfersLoading(false)
  }, [project.projectId])

  // Poll while any RECEIVE transfer is still awaiting/mid-upload
  useEffect(() => {
    if (activeTab !== 'transfers') return
    const active = (transfers ?? []).some(t => t.status === 'PENDING' || t.status === 'UPLOADING')
    if (!active) return
    const timer = setInterval(loadTransfers, 5000)
    return () => clearInterval(timer)
  }, [activeTab, transfers, loadTransfers])

  const transferShareUrl = (t: StudioTransfer): string => {
    const base = process.env.NEXT_PUBLIC_STUDIO_URL ?? 'https://studio.vayutransfer.com'
    return `${base}/studio/transfer/${t.direction === 'SEND' ? 'send' : 'receive'}/${t.shareToken}`
  }

  const copyTransferLink = async (t: StudioTransfer) => {
    await navigator.clipboard.writeText(transferShareUrl(t))
    setTransferCopiedId(t.transferId)
    setTimeout(() => setTransferCopiedId(null), 2000)
  }

  const requestTransferFile = async () => {
    setRequestingTransfer(true)
    setTransfersError(null)
    const res = await fetch(`/studio/api/admin/projects/${project.projectId}/transfers`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction: 'RECEIVE' }),
    }).then(r => r.json())
    setRequestingTransfer(false)
    if (!res.success) { setTransfersError(res.message ?? 'Could not create request link'); return }
    await loadTransfers()
  }

  const sendTransferFile = async (file: File) => {
    setTransfersError(null)
    setSendTransferProgress({ filename: file.name, percent: 0 })
    const partCount = Math.ceil(file.size / CHUNK_SIZE)
    try {
      const initRes = await fetch(`/studio/api/admin/projects/${project.projectId}/transfers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: 'SEND', filename: file.name, mimeType: file.type, sizeBytes: file.size, partCount }),
      }).then(r => r.json())
      if (!initRes.success) throw new Error(initRes.message ?? 'Could not start upload')
      const { transferId, uploadId, presignedUrls } = initRes.data

      const parts: PartRecord[] = await uploadFileInChunks(file, presignedUrls, [], (_bytes, partsDone) => {
        setSendTransferProgress({ filename: file.name, percent: Math.round((partsDone / partCount) * 100) })
      })

      const completeRes = await fetch(`/studio/api/admin/projects/${project.projectId}/transfers/${transferId}/upload-complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, parts }),
      }).then(r => r.json())
      if (!completeRes.success) throw new Error(completeRes.message ?? 'Could not finish upload')

      setSendTransferProgress(null)
      await loadTransfers()
    } catch (err) {
      setSendTransferProgress(null)
      setTransfersError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  const resendTransfer = async (transferId: string) => {
    setTransfersBusyId(transferId)
    setTransfersError(null)
    const res = await fetch(`/studio/api/admin/projects/${project.projectId}/transfers/${transferId}/resend`, { method: 'POST' }).then(r => r.json())
    setTransfersBusyId(null)
    if (!res.success) { setTransfersError(res.message ?? 'Could not regenerate link'); return }
    await loadTransfers()
  }

  const importTransferToGallery = async (transferId: string) => {
    setTransfersBusyId(transferId)
    setTransfersError(null)
    const res = await fetch(`/studio/api/admin/projects/${project.projectId}/transfers/${transferId}/import`, { method: 'POST' }).then(r => r.json())
    setTransfersBusyId(null)
    if (!res.success) { setTransfersError(res.message ?? 'Could not import to gallery'); return }
    await loadTransfers()
    loadFiles(); onUpdated()
  }

  const removeTransfer = async (transferId: string) => {
    if (!confirm('Delete this transfer? This cannot be undone.')) return
    setTransfersBusyId(transferId)
    setTransfersError(null)
    const res = await fetch(`/studio/api/admin/projects/${project.projectId}/transfers/${transferId}`, { method: 'DELETE' }).then(r => r.json())
    setTransfersBusyId(null)
    if (!res.success) { setTransfersError(res.message ?? 'Could not delete transfer'); return }
    await loadTransfers()
  }

  const generatePrintLink = async () => {
    setPrintGenerating(true)
    setPrintBlockedMessage(null)
    const res = await fetch(`/studio/api/admin/projects/${project.projectId}/print-link`, { method: 'POST' }).then(r => r.json())
    setPrintGenerating(false)
    if (res.success) {
      setPrintUrl(res.data.printUrl)
    } else if (res.error === 'EDITS_PENDING') {
      setPrintBlockedMessage(res.message)
      needsEditingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      setPrintBlockedMessage(res.message ?? 'Could not generate print link. Please try again.')
    }
  }

  const setEditUploadState = (fileId: string, patch: Partial<EditUploadState>) =>
    setEditUploadStates((prev) => {
      const next = new Map(prev)
      next.set(fileId, { ...(prev.get(fileId) ?? { status: 'idle', progress: 0 }), ...patch })
      return next
    })

  const handleEditUpload = async (fileId: string, file: File) => {
    setEditUploadState(fileId, { status: 'uploading', progress: 0 })
    try {
      const initRes = await fetch(
        `/studio/api/admin/projects/${project.projectId}/files/${fileId}/upload-edited`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, mimeType: file.type }) }
      ).then(r => r.json())
      if (!initRes.success) throw new Error(initRes.message ?? 'Upload init failed')
      const { presignedUrl, editedR2Key } = initRes.data

      const xhr = new XMLHttpRequest()
      await new Promise<void>((resolve, reject) => {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setEditUploadState(fileId, { progress: Math.round((e.loaded / e.total) * 100) })
        }
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`R2 PUT ${xhr.status}`)))
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.open('PUT', presignedUrl)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.send(file)
      })

      const completeRes = await fetch(
        `/studio/api/admin/projects/${project.projectId}/files/${fileId}/upload-edited-complete`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ editedR2Key }) }
      ).then(r => r.json())
      if (!completeRes.success) throw new Error('Failed to confirm upload')

      setEditUploadState(fileId, { status: 'done', progress: 100 })
      const refreshed = await fetch(`/studio/api/admin/projects/${project.projectId}/selections`).then(r => r.json())
      if (refreshed.success) setSelItems(refreshed.data)
    } catch (err) {
      setEditUploadState(fileId, { status: 'error', error: err instanceof Error ? err.message : 'Upload failed' })
    }
  }

  const downloadOriginalEdit = async (fileId: string) => {
    const res = await fetch(`/studio/api/admin/projects/${project.projectId}/files/${fileId}/download?version=original`).then(r => r.json())
    if (res.success) window.open(res.data.url, '_blank')
  }

  // Current/best version (edited if one exists) — the general per-photo
  // "Download" action, distinct from downloadOriginalEdit's forced-original.
  const downloadPhoto = async (fileId: string) => {
    const res = await fetch(`/studio/api/admin/projects/${projectIdOf(fileId)}/files/${fileId}/download`).then(r => r.json())
    if (res.success) window.open(res.data.url, '_blank')
  }

  const toggleWatermark = async (fileId: string, watermarkEnabled: boolean) => {
    await fetch(`/studio/api/admin/projects/${projectIdOf(fileId)}/files/${fileId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ watermarkEnabled }),
    }).catch(() => {})
    await loadFiles()
  }

  const copyFilename = async (filename: string) => {
    await navigator.clipboard.writeText(filename)
  }

  // Admin-only curation pipeline: undefined -> STARRED -> FAVORITE -> FINAL -> undefined.
  // Shared by the grid tile menu, the lightbox menu, and the list view's move
  // icon so all three stay in sync rather than offering divergent affordances.
  const CURATION_ORDER: (CurationStatus | undefined)[] = [undefined, 'STARRED', 'FAVORITE', 'FINAL']
  const nextCurationStatus = (current?: CurationStatus): CurationStatus | undefined =>
    CURATION_ORDER[(CURATION_ORDER.indexOf(current) + 1) % CURATION_ORDER.length]
  // "(Admin only)" — this is the studio admin's own private curation mark,
  // never visible or settable by the client, distinct from the client's own
  // loved/submitted state elsewhere in the gallery.
  const curationMenuLabel = (current?: CurationStatus): string => {
    if (current === 'FINAL') return 'Clear curation status (Admin only)'
    if (current === 'FAVORITE') return 'Mark Final (Admin only)'
    if (current === 'STARRED') return 'Mark Favorite (Admin only)'
    return 'Mark Starred (Admin only)'
  }
  // Optimistic — a full loadFiles() reload re-fetches every photo's signed
  // preview URL (slow on large galleries) for a change that has no
  // server-computed visual side effect. Update locally, save in the
  // background, and only revert if the save actually fails.
  const saveCurationStatus = async (fileId: string, current: CurationStatus | undefined, next: CurationStatus | undefined) => {
    setFiles(prev => prev.map(f => f.fileId === fileId ? { ...f, curationStatus: next } : f))
    try {
      const res = await fetch(`/studio/api/admin/projects/${projectIdOf(fileId)}/files/${fileId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ curationStatus: next ?? null }),
      }).then(r => r.json())
      if (!res.success) throw new Error(res.message ?? 'Failed to save')
    } catch {
      setFiles(prev => prev.map(f => f.fileId === fileId ? { ...f, curationStatus: current } : f))
    }
  }
  // Advances through all 3 stages — used by the "⋯" menu (labelled per-stage)
  // and the list view's dedicated move icon, where the progression is explicit.
  const cycleCurationStatus = (fileId: string, current?: CurationStatus) =>
    saveCurationStatus(fileId, current, nextCurationStatus(current))
  // A simple two-state star/unstar toggle — the grid tile's star icon only
  // shows filled-vs-outline (2 visual states), so cycling it through all 3
  // stages meant un-starring from Favorite/Final needed 2-3 clicks with no
  // visible feedback in between, which read as broken. Any non-empty status
  // clears in one click; clicking again from empty sets Starred.
  const toggleStarred = (fileId: string, current?: CurationStatus) =>
    saveCurationStatus(fileId, current, current ? undefined : 'STARRED')

  // Shared per-photo action set — used by both the grid tile's "⋯" menu and
  // the list view's "⋯" menu, so the two views never drift apart.
  const buildPhotoMenuActions = (f: MediaFile, idx: number): PhotoMenuAction[] => [
    {
      label: 'Open', icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 4.5v6m0-6h6m-6 0l6.75 6.75M19.5 4.5v6m0-6h-6m6 0l-6.75 6.75M4.5 19.5v-6m0 6h6m-6 0l6.75-6.75M19.5 19.5v-6m0 6h-6m6 0l-6.75-6.75" />
        </svg>
      ),
      onClick: () => { setPreviewMode('all'); setAdminPreviewIdx(idx); setShowAdminPreview(true) },
    },
    {
      label: 'Download', icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
      ),
      onClick: () => downloadPhoto(f.fileId),
    },
    {
      label: 'Copy filename', icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
        </svg>
      ),
      onClick: () => copyFilename(f.originalFilename),
    },
    {
      label: f.watermarkEnabled ? 'Remove Watermark' : 'Apply Watermark', icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      onClick: () => toggleWatermark(f.fileId, !f.watermarkEnabled),
    },
    {
      label: 'Rename', icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
        </svg>
      ),
      onClick: () => { setRenamingFile(f); setRenameValue(f.originalFilename) },
    },
    {
      label: (activeSourceProjects.find(p => p.projectId === f.projectId) ?? project).coverPhotoFileId === f.fileId ? '✓ Cover Photo' : 'Set as Cover', icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 21h18a1.5 1.5 0 001.5-1.5V4.5A1.5 1.5 0 0021 3H3a1.5 1.5 0 00-1.5 1.5v15A1.5 1.5 0 003 21zM9.75 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
        </svg>
      ),
      onClick: () => setCoverPhoto(f.fileId),
    },
    {
      label: curationMenuLabel(f.curationStatus), icon: (
        <svg fill={f.curationStatus ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.5a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.385a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
        </svg>
      ),
      onClick: () => cycleCurationStatus(f.fileId, f.curationStatus),
    },
    {
      label: 'Copy to event…', icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
        </svg>
      ),
      onClick: () => setMoveCopyTarget({ mode: 'copy', file: f }),
    },
    {
      label: 'Move to event…', icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
        </svg>
      ),
      onClick: () => setMoveCopyTarget({ mode: 'move', file: f }),
    },
    {
      label: 'Delete', danger: true, icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      ),
      onClick: () => deleteFiles([f.fileId]),
    },
  ]

  const saveRename = async () => {
    if (!renamingFile || !renameValue.trim()) return
    setRenameSaving(true)
    await fetch(`/studio/api/admin/projects/${renamingFile.projectId}/files/${renamingFile.fileId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalFilename: renameValue.trim() }),
    }).catch(() => {})
    setRenameSaving(false)
    setRenamingFile(null)
    await loadFiles()
  }

  const setCoverPhoto = async (fileId: string) => {
    setSettingCoverId(fileId)
    await fetch(`/studio/api/admin/projects/${projectIdOf(fileId)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coverPhotoFileId: fileId }),
    }).catch(() => {})
    setSettingCoverId(null)
    onUpdated()
  }

  // Omitting fileIds targets every eligible file in the project — the
  // backend route already supports this (used for the header's always-on
  // Watermark button when nothing is selected; targets just the selection
  // when something is). Grouped per-project so this stays correct when the
  // grid is showing merged multi-event photos.
  const bulkApplyWatermark = async (watermarkEnabled: boolean) => {
    setBulkWatermarking(true)
    if (selectedIds.size > 0) {
      const byProject = new Map<string, string[]>()
      selectedIds.forEach(fid => {
        const pid = projectIdOf(fid)
        if (!byProject.has(pid)) byProject.set(pid, [])
        byProject.get(pid)!.push(fid)
      })
      await Promise.all(Array.from(byProject.entries()).map(([pid, fileIds]) =>
        fetch(`/studio/api/admin/projects/${pid}/watermark`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileIds, watermarkEnabled }),
        }).catch(() => {})
      ))
    } else {
      await Promise.all(activeSourceProjects.map(p =>
        fetch(`/studio/api/admin/projects/${p.projectId}/watermark`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ watermarkEnabled }),
        }).catch(() => {})
      ))
    }
    setBulkWatermarking(false)
    setTimeout(loadFiles, 3000)
  }

  // Selection-bar bulk star toggle — standard "star-all" UX: if every
  // selected photo is already starred, clicking clears all of them;
  // otherwise it stars every selected photo that isn't already. Reuses the
  // same optimistic saveCurationStatus() the single-photo star button uses.
  const selectedFiles = files.filter(f => selectedIds.has(f.fileId))
  const allSelectedStarred = selectedFiles.length > 0 && selectedFiles.every(f => !!f.curationStatus)
  const bulkToggleStar = async () => {
    const next = allSelectedStarred ? undefined : 'STARRED'
    await Promise.all(selectedFiles.map(f => saveCurationStatus(f.fileId, f.curationStatus, next)))
  }

  // Runs AI face indexing scoped to just the selected photos — same route
  // the Face Index tab already uses, grouped per-project the same way
  // bulkApplyWatermark is (a selection can span multiple merged events).
  const bulkAISort = async () => {
    setBulkAISorting(true)
    const byProject = new Map<string, string[]>()
    selectedIds.forEach(fid => {
      const pid = projectIdOf(fid)
      if (!byProject.has(pid)) byProject.set(pid, [])
      byProject.get(pid)!.push(fid)
    })
    await Promise.all(Array.from(byProject.entries()).map(([pid, fileIds]) =>
      fetch(`/studio/api/admin/projects/${pid}/faces/index`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds }),
      }).catch(() => {})
    ))
    setBulkAISorting(false)
  }

  // Sequential with a small stagger — opening many tabs at once via
  // Promise.all would get most of them blocked by the browser's popup
  // blocker (only the first synchronous window.open per user gesture is
  // reliably allowed).
  const bulkDownloadSelected = async () => {
    for (const fid of Array.from(selectedIds)) {
      await downloadPhoto(fid)
      await new Promise(r => setTimeout(r, 150))
    }
  }

  // ── Photo lifecycle filter (header filter icon) ────────────
  const loadSelections = async () => {
    if (clientSelections !== null) return
    setSelLoading(true)
    const res = await fetch(`/studio/api/admin/projects/${project.projectId}/selections`).then(r => r.json())
    if (res.success) setClientSelections(res.data)
    setSelLoading(false)
  }

  const setFilter = async (scope: PhotoScope) => {
    if (scope === 'ALL' || viewFilter === scope) { setViewFilter('ALL'); return }
    if (scope === 'CLIENT_FAVORITE' || scope === 'EDIT_REQUIRED') await loadSelections()
    setViewFilter(scope)
  }

  const togglePhoto = (fileId: string) => {
    const next = new Set(selectedIds)
    next.has(fileId) ? next.delete(fileId) : next.add(fileId)
    onSelectionChange(next)
  }

  const deleteFiles = async (fileIds: string[]) => {
    if (!fileIds.length) return
    setDeleting(true)
    setDeleteError(null)
    const results = await Promise.all(fileIds.map(fid =>
      fetch(`/studio/api/admin/projects/${projectIdOf(fid)}/files/${fid}`, { method: 'DELETE' })
        .then(async (res) => ({ fid, ok: res.ok && (await res.json().catch(() => ({ success: true }))).success !== false }))
        .catch(() => ({ fid, ok: false }))
    ))
    const failed = results.filter(r => !r.ok)
    setDeleteMode(null); onSelectionChange(new Set()); setDeleting(false)
    if (failed.length > 0) {
      setDeleteError(`Could not delete ${failed.length} of ${fileIds.length} photo${fileIds.length !== 1 ? 's' : ''} — please try again.`)
    }
    await loadFiles(); onUpdated()
  }

  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set())
  const retryFile = async (fileId: string) => {
    setRetryingIds(prev => new Set(prev).add(fileId))
    await fetch(`/studio/api/admin/projects/${projectIdOf(fileId)}/files/${fileId}/retry-watermark`, { method: 'POST' }).catch(() => {})
    setRetryingIds(prev => { const next = new Set(prev); next.delete(fileId); return next })
    await loadFiles()
  }

  const uploadFile = async (file: File, itemId: string) => {
    const update = (patch: Partial<UploadItem>) =>
      setUploads(prev => prev.map(u => u.id === itemId ? { ...u, ...patch } : u))
    update({ status: 'uploading', progress: 0 })
    const partCount = Math.ceil(file.size / CHUNK_SIZE)
    try {
      // Resumes from a previous attempt if the same file was seen before
      // and the server still has that upload alive.
      const { fileId, uploadId, presignedUrls, completedParts } = await initOrResumeUpload(project.projectId, file, partCount)
      const parts: PartRecord[] = await uploadFileInChunks(file, presignedUrls, completedParts, (uploadedBytes, partsDone) => {
        update({ progress: Math.round((partsDone / partCount) * 100), uploadedBytes })
      })
      const completeRes = await fetchWithTimeout(`/studio/api/admin/projects/${project.projectId}/upload-complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, uploadId, parts }),
      }).then(r => r.json())
      if (!completeRes.success) throw new Error(completeRes.message ?? 'Complete failed')
      clearUploadResume(project.projectId, file.name, file.size, file.lastModified)
      update({ status: 'done', progress: 100, uploadedBytes: file.size })
      loadFiles(); onUpdated()
    } catch (err) {
      update({
        status: 'error',
        error: (err instanceof Error ? err.message : 'Upload failed') + ' — re-select the same file to resume',
      })
    }
  }

  const handleFiles = (selected: FileList | null) => {
    if (!selected) return
    const items: UploadItem[] = Array.from(selected).map(f => ({ id: crypto.randomUUID(), file: f, progress: 0, status: 'queued' as const, uploadedBytes: 0 }))
    setUploads(prev => [...prev, ...items])
    // Bounded concurrency — selecting hundreds/thousands of files and firing
    // them all at once is what caused large batches to silently stall past a
    // few hundred files (see MAX_CONCURRENT_UPLOADS comment above).
    runWithConcurrencyLimit(items, MAX_CONCURRENT_UPLOADS, (item) => uploadFile(item.file, item.id))
  }

  const generateShareLink = async () => {
    if (selectedIds.size === 0) {
      setShareError('Please select at least one photo to share')
      return
    }

    // Single project (the common case) — unchanged, including the
    // selection min/max range option (a per-project setting, meaningless
    // when spanning multiple events).
    if (activeSourceProjects.length <= 1) {
      setShareError(null)
      setSharing(true)
      const hasRange = selMax > 0
      const res = await fetch(`/studio/api/admin/projects/${project.projectId}/share-link`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expiryDays: 30,
          ...(hasRange ? { selectionMin: selMin, selectionMax: selMax } : {}),
          includedFileIds: Array.from(selectedIds),
        }),
      }).then(r => r.json())
      setSharing(false); setShowShareSetup(false)
      if (res.success) setShareUrl(res.data.shareUrl)
      else setShareError(res.message ?? 'Failed to generate link')
      return
    }

    // Multi-event — one share link per project the current selection
    // touches. All involved projects must belong to the same client.
    const byProject = new Map<string, string[]>()
    selectedIds.forEach(fid => {
      const pid = projectIdOf(fid)
      if (!byProject.has(pid)) byProject.set(pid, [])
      byProject.get(pid)!.push(fid)
    })
    const involvedProjects = activeSourceProjects.filter(p => byProject.has(p.projectId))
    const emails = Array.from(new Set(involvedProjects.map(p => p.clientEmail)))
    if (emails.length > 1) {
      setShareError('Selected photos belong to different clients. Narrow the event dropdown to one client\'s events before sharing.')
      return
    }

    setShareError(null)
    setSharing(true)
    const results = await Promise.all(
      involvedProjects.map(p =>
        fetch(`/studio/api/admin/projects/${p.projectId}/share-link`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expiryDays: 30, includedFileIds: byProject.get(p.projectId) }),
        }).then(r => r.json())
      )
    )
    setSharing(false); setShowShareSetup(false)
    const failed = results.find(r => !r.success)
    if (failed) {
      setShareError(failed.message ?? 'Failed to generate link')
      return
    }
    setShareUrl(results[0]?.data?.shareUrl ?? '')
  }

  const copyLink = async () => {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  // Lightbox "quick share" — selects just this one photo and opens the
  // existing share setup panel, reusing its safety behavior (explicit
  // "Generate & Share" click required, never auto-mints/emails on its own).
  const quickSharePhoto = (fileId: string) => {
    onSelectionChange(new Set([fileId]))
    setShowAdminPreview(false)
    setShowPhotoInfo(false)
    setShowShareSetup(true)
  }

  // ── Tab switch ────────────────────────────────────────────
  const switchTab = (tab: ActiveTab) => {
    setActiveTab(tab)
    if (tab === 'faces' && !faceStatus && !faceLoading) loadFaceStatus()
    if (tab === 'selections') loadSelItems()
    if (tab === 'transfers' && transfers === null && !transfersLoading) loadTransfers()
  }

  // ── Derived values ────────────────────────────────────────
  const displayFiles: MediaFile[] = (() => {
    if (viewFilter === 'ALL') return files
    const selections = clientSelections?.map(s => s.selection) ?? []
    const ids = resolveScopeFileIds(viewFilter, files, selections, project)
    if (!ids) return files
    const idSet = new Set(ids)
    return files.filter(f => idSet.has(f.fileId))
  })()

  const editCommentMap: Map<string, string> = viewFilter === 'EDIT_REQUIRED' && clientSelections
    ? new Map(clientSelections.filter(s => s.selection.editingRequired && s.selection.comment).map(s => [s.file.fileId, s.selection.comment!]))
    : new Map()

  const selectedCount   = selectedIds.size
  const deleteTargetIds = deleteMode === 'all' ? displayFiles.map(f => f.fileId) : Array.from(selectedIds)

  const clientFinalizedInBatch = clientSelections
    ? deleteTargetIds.filter(id => clientSelections.some(s => s.file.fileId === id && s.selection.isSelected)).length
    : 0

  const searchedDisplayFiles = searchQuery.trim()
    ? displayFiles.filter(f => f.originalFilename.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : displayFiles
  const sortedDisplayFiles = sortFiles(searchedDisplayFiles, sortMode)

  const selectedPhotosForPreview = files.filter(f => selectedIds.has(f.fileId))
  const previewPhotos = previewMode === 'selected' ? selectedPhotosForPreview : sortedDisplayFiles
  const currentPreviewPhoto = previewPhotos[adminPreviewIdx] as MediaFile | undefined

  // Face index derived
  const isIndexing = !!faceStatus?.activeJob
  const isReady    = !isIndexing && (faceStatus?.indexedPhotos ?? 0) > 0 && (faceStatus?.pendingPhotos ?? 0) === 0
  const hasPartial = !isIndexing && (faceStatus?.indexedPhotos ?? 0) > 0 && (faceStatus?.pendingPhotos ?? 0) > 0
  const neverRun   = !isIndexing && (faceStatus?.indexedPhotos ?? 0) === 0

  // Keyboard navigation for the admin photo preview lightbox — placed here
  // (not with the other effects near the top) because it needs previewPhotos,
  // which is derived from displayFiles and can't be computed before that.
  useEffect(() => {
    if (!showAdminPreview) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft')  setAdminPreviewIdx(i => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setAdminPreviewIdx(i => Math.min(previewPhotos.length - 1, i + 1))
      if (e.key === 'Escape')     { setShowAdminPreview(false); setShowPhotoInfo(false) }
      if (e.key === 'i' || e.key === 'I') setShowPhotoInfo(v => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showAdminPreview, previewPhotos.length])

  // Clear stale dimensions immediately when switching photos — otherwise the
  // previous photo's size would flash briefly before the new image loads.
  useEffect(() => { setPreviewImgDims(null) }, [currentPreviewPhoto?.fileId])

  return (
    <>
      {/* ── Rename modal ────────────────────────────────────── */}
      {renamingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-text-primary">Rename photo</h3>
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveRename() }}
              className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent/60"
            />
            <div className="flex gap-3">
              <button onClick={() => setRenamingFile(null)} disabled={renameSaving}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text-primary hover:bg-border/40 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={saveRename} disabled={renameSaving || !renameValue.trim()}
                className="flex-1 py-2.5 rounded-xl bg-accent text-bg text-sm font-bold hover:bg-accent/90 transition-colors disabled:opacity-60">
                {renameSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {moveCopyTarget && (
        <MoveCopyPhotoModal
          mode={moveCopyTarget.mode}
          clientName={(activeSourceProjects.find(p => p.projectId === moveCopyTarget.file.projectId) ?? project).clientName}
          currentProjectId={moveCopyTarget.file.projectId}
          fileId={moveCopyTarget.file.fileId}
          onClose={() => setMoveCopyTarget(null)}
          onDone={() => { setMoveCopyTarget(null); loadFiles(); onUpdated() }}
        />
      )}

      {/* ── Delete confirmation modal ───────────────────────── */}
      {deleteMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <div className="text-4xl mb-3">{clientFinalizedInBatch > 0 ? '⚠️' : '🗑️'}</div>
              <h3 className="text-base font-bold text-text-primary">
                {deleteMode === 'all' ? `Delete all ${files.length} photos?` : `Delete ${selectedCount} photo${selectedCount !== 1 ? 's' : ''}?`}
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

      {/* ── Admin photo preview modal (lightbox) ──────────────── */}
      {showAdminPreview && previewPhotos.length > 0 && (
        <div className="fixed inset-0 z-[70] bg-black/95 flex flex-col" onClick={() => { setShowAdminPreview(false); setShowPhotoInfo(false) }}>
          {/* Header — filename/close on its own row, then a full-width icon
              toolbar row below, so icons never compete for space with a long
              filename (that was pushing them off narrow/mobile screens). */}
          <div className="flex flex-col gap-2 px-4 pt-4 pb-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-white/50 text-xs font-semibold flex-shrink-0">{adminPreviewIdx + 1} / {previewPhotos.length}</span>
                <span className="text-white font-semibold text-sm truncate">{currentPreviewPhoto?.originalFilename}</span>
              </div>
              <button onClick={() => { setShowAdminPreview(false); setShowPhotoInfo(false) }} title="Close"
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {currentPreviewPhoto && (
                <button onClick={() => toggleStarred(currentPreviewPhoto.fileId, currentPreviewPhoto.curationStatus)}
                  title={currentPreviewPhoto.curationStatus ? 'Unstar (Admin only)' : 'Star (Admin only)'}
                  className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                  <svg className={`w-4 h-4 ${currentPreviewPhoto.curationStatus ? 'text-yellow-400' : 'text-white'}`}
                    viewBox="0 0 24 24" fill={currentPreviewPhoto.curationStatus ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.5a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.385a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                  </svg>
                </button>
              )}
              {currentPreviewPhoto && (
                <button onClick={() => quickSharePhoto(currentPreviewPhoto.fileId)} title="Quick Share"
                  className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                  </svg>
                </button>
              )}
              {currentPreviewPhoto && (
                <button onClick={() => downloadPhoto(currentPreviewPhoto.fileId)} title="Download"
                  className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                </button>
              )}
              <button onClick={() => setShowPhotoInfo(v => !v)} title="Info (i)"
                className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl transition-colors ${showPhotoInfo ? 'bg-accent text-bg' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
              </button>
              {currentPreviewPhoto && (
                <PhotoActionsMenu
                  align="right"
                  trigger={
                    <span className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-white cursor-pointer">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="5" r="1.75" /><circle cx="12" cy="12" r="1.75" /><circle cx="12" cy="19" r="1.75" />
                      </svg>
                    </span>
                  }
                  actions={[
                    {
                      label: currentPreviewPhoto.watermarkEnabled ? 'Remove Watermark' : 'Apply Watermark',
                      icon: (
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ),
                      onClick: () => toggleWatermark(currentPreviewPhoto.fileId, !currentPreviewPhoto.watermarkEnabled),
                    },
                    {
                      label: 'Copy filename',
                      icon: (
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                        </svg>
                      ),
                      onClick: () => copyFilename(currentPreviewPhoto.originalFilename),
                    },
                    {
                      label: 'Rename',
                      icon: (
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                        </svg>
                      ),
                      onClick: () => { setRenamingFile(currentPreviewPhoto); setRenameValue(currentPreviewPhoto.originalFilename) },
                    },
                    {
                      label: project.coverPhotoFileId === currentPreviewPhoto.fileId ? '✓ Cover Photo' : 'Set as Cover',
                      icon: (
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 21h18a1.5 1.5 0 001.5-1.5V4.5A1.5 1.5 0 0021 3H3a1.5 1.5 0 00-1.5 1.5v15A1.5 1.5 0 003 21zM9.75 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                        </svg>
                      ),
                      onClick: () => setCoverPhoto(currentPreviewPhoto.fileId),
                    },
                    {
                      label: curationMenuLabel(currentPreviewPhoto.curationStatus),
                      icon: (
                        <svg fill={currentPreviewPhoto.curationStatus ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.5a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.385a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                        </svg>
                      ),
                      onClick: () => cycleCurationStatus(currentPreviewPhoto.fileId, currentPreviewPhoto.curationStatus),
                    },
                    {
                      label: 'Delete',
                      danger: true,
                      icon: (
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      ),
                      onClick: () => { setShowAdminPreview(false); deleteFiles([currentPreviewPhoto.fileId]) },
                    },
                  ]}
                />
              )}
            </div>
          </div>
          {/* Body: main photo + optional info panel */}
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 flex items-center justify-center overflow-hidden relative"
              onTouchStart={e => { adminTouchStartX.current = e.touches[0].clientX }}
              onTouchEnd={e => {
                const diff = adminTouchStartX.current - e.changedTouches[0].clientX
                if (Math.abs(diff) < 50) return
                if (diff > 0) setAdminPreviewIdx(i => Math.min(previewPhotos.length - 1, i + 1))
                else setAdminPreviewIdx(i => Math.max(0, i - 1))
              }}
              onClick={e => e.stopPropagation()}>
              <img key={currentPreviewPhoto?.fileId}
                src={currentPreviewPhoto?.r2PreviewUrl ?? ''}
                onLoad={e => setPreviewImgDims({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
                alt="" className="max-h-full max-w-full object-contain select-none" draggable={false} />
              {adminPreviewIdx > 0 && (
                <button onClick={() => setAdminPreviewIdx(i => i - 1)}
                  className="absolute left-3 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/75 active:scale-95 transition-all border border-white/20">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                </button>
              )}
              {adminPreviewIdx < previewPhotos.length - 1 && (
                <button onClick={() => setAdminPreviewIdx(i => i + 1)}
                  className="absolute right-3 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/75 active:scale-95 transition-all border border-white/20">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              )}
            </div>
            {showPhotoInfo && currentPreviewPhoto && (
              <div className="w-72 flex-shrink-0 bg-card border-l border-border overflow-y-auto p-5 space-y-4" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-bold text-text-primary">Photo info</h3>
                <div className="space-y-3">
                  {[
                    ['Filename', currentPreviewPhoto.originalFilename],
                    ['Size', fmtBytes(currentPreviewPhoto.sizeBytes)],
                    ['Type', currentPreviewPhoto.mimeType],
                    ...(previewImgDims ? [['Dimensions', `${previewImgDims.width} × ${previewImgDims.height}`]] : []),
                    ['Uploaded', fmtDate(currentPreviewPhoto.uploadedAt)],
                    ['Watermark', currentPreviewPhoto.watermarkEnabled ? 'Applied' : 'Not applied'],
                    ...(currentPreviewPhoto.editedS3Key || currentPreviewPhoto.editedR2Key ? [['Edited', 'Yes']] : []),
                    ...(currentPreviewPhoto.faceIndexed ? [['Faces detected', String(currentPreviewPhoto.faceCount ?? 0)]] : []),
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div className="text-[10px] uppercase tracking-wide text-muted font-semibold">{label}</div>
                      <div className="text-xs text-text-primary break-words mt-0.5">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Thumbnail strip */}
          <div className="flex-shrink-0 flex gap-2 overflow-x-auto px-4 pb-6 pt-3 snap-x snap-mandatory scrollbar-hide" onClick={e => e.stopPropagation()}>
            {previewPhotos.map((photo, idx) => (
              <button key={photo.fileId} onClick={() => setAdminPreviewIdx(idx)}
                className={`relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden snap-start border-2 transition-all ${
                  idx === adminPreviewIdx ? 'border-accent scale-105' : 'border-white/20 opacity-60'}`}>
                <img src={photo.r2PreviewUrl ?? ''} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
          {previewPhotos.length > 1 && !showPhotoInfo && (
            <div className="absolute bottom-[90px] inset-x-0 flex justify-center pointer-events-none">
              <span className="text-white/30 text-xs">← swipe to browse →</span>
            </div>
          )}
        </div>
      )}

      {/* z-20, not z-50 — this is a fullscreen *view*, not a modal, and must never
          paint over the delete-confirm/edit/share modals or global overlays that
          also target z-50; those need to stay reachable while the grid is expanded. */}
      <div className={`dash-bold-text ${expanded ? 'fixed inset-0 z-20 overflow-auto bg-bg' : ''}`}>

        {/* ── Event header ──────────────────────────────────────── */}
        {/* Event name/date/status and the multi-select-events dropdown were
            removed — the sidebar already shows all of that (project card +
            per-event checkboxes), so duplicating it here was just confusing.
            The tab navigation now lives in this same row instead of its own
            row below, since that space is free. */}
        <div className={`px-5 py-3 flex items-center gap-3 border-b border-border ${expanded ? 'sticky top-0 z-10 bg-bg/95 backdrop-blur' : ''}`}>
          <div className="flex items-center gap-0 flex-shrink-0">
            {/* "All Photos" tab doubles as the lifecycle filter dropdown — picking
                a stage both switches to the photos tab and applies that filter,
                so there's no separate filter icon to find. */}
            <PhotoActionsMenu
              align="left"
              trigger={
                <button
                  onClick={() => switchTab('photos')}
                  className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                    activeTab === 'photos' ? 'bg-accent/10 text-accent' : 'text-muted hover:text-text-primary hover:bg-border/40'
                  }`}
                >
                  {activeTab === 'photos' ? PHOTO_SCOPE_LABEL[viewFilter] : 'All Photos'}
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              }
              actions={PHOTO_SCOPE_ORDER.map(scope => ({
                label: viewFilter === scope ? `${PHOTO_SCOPE_LABEL[scope]}  ✓` : PHOTO_SCOPE_LABEL[scope],
                icon: <PhotoScopeIcon scope={scope} />,
                onClick: () => { switchTab('photos'); setFilter(scope) },
              }))}
            />
            {(['faces', 'selections', 'transfers'] as ActiveTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => switchTab(tab)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                  activeTab === tab ? 'bg-accent/10 text-accent' : 'text-muted hover:text-text-primary hover:bg-border/40'
                }`}
              >
                {tab === 'faces' ? 'Face Index ✨' : tab === 'selections' ? 'Selections' : 'Raw Transfers'}
              </button>
            ))}
          </div>

          {/* Filename search — client-side filter over already-loaded photos */}
          {activeTab === 'photos' && (
            <div className="flex-1 min-w-[100px] max-w-xs relative hidden sm:block">
              <svg className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search photos..."
                className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-border bg-bg text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/50 transition-colors"
              />
            </div>
          )}

          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            {activeTab === 'photos' && (
              <>
                <button onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                  title={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted hover:text-accent hover:border-accent/40 hover:bg-accent/10 transition-colors">
                  {viewMode === 'grid' ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                    </svg>
                  )}
                </button>
                <PhotoActionsMenu
                  align="right"
                  trigger={
                    <span title="Sort photos"
                      className={`w-7 h-7 flex items-center justify-center rounded-lg border cursor-pointer transition-colors ${
                        sortMode !== 'DEFAULT' ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border text-muted hover:text-accent hover:border-accent/40 hover:bg-accent/10'
                      }`}>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M8 15l4 4 4-4" />
                      </svg>
                    </span>
                  }
                  actions={(Object.keys(SORT_LABEL) as SortMode[]).map(mode => ({
                    label: (sortMode === mode ? '✓ ' : '') + SORT_LABEL[mode],
                    icon: (
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M8 15l4 4 4-4" />
                      </svg>
                    ),
                    onClick: () => setSortMode(mode),
                  }))}
                />
              </>
            )}
            {/* AI Face — shortcut into the Face Index tab, same feature just surfaced here too */}
            <button onClick={() => switchTab('faces')} title="AI Face Index"
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted hover:text-accent hover:border-accent/40 hover:bg-accent/10 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.344.344a.75.75 0 01-.53.22H9.75a.75.75 0 01-.53-.22l-.344-.344z" />
              </svg>
            </button>
            <button onClick={() => setUploadOpen(v => !v)} title="Upload photos"
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted hover:text-accent hover:border-accent/40 hover:bg-accent/10 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </button>
            <button onClick={loadFiles} title="Refresh photos"
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted hover:text-accent hover:border-accent/40 hover:bg-accent/10 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            {/* Expand / collapse fullscreen */}
            <button onClick={() => setExpanded(v => !v)} title={expanded ? 'Exit fullscreen' : 'Expand to fullscreen'}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted hover:text-accent hover:border-accent/40 hover:bg-accent/10 transition-colors">
              {expanded
                ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0v5m0-5h5M15 9l5-5m0 0v5m0-5h-5M9 15l-5 5m0 0h5m-5 0v-5M15 15l5 5m0 0h-5m5 0v-5" />
                  </svg>
                : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                  </svg>
              }
            </button>

            {/* Notifications — recently completed jobs for this project */}
            <div className="relative" ref={notifRef}>
              <button onClick={() => setShowNotif(v => !v)} title="Notifications"
                className="relative w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted hover:text-accent hover:border-accent/40 hover:bg-accent/10 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold">
                    {notifications.length}
                  </span>
                )}
              </button>
              {showNotif && (
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-card border border-border rounded-xl shadow-2xl py-1.5 z-30">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-muted px-3 py-2">No recent activity</p>
                  ) : (
                    notifications.map(n => (
                      <div key={n.jobId} className="px-3 py-2 text-xs">
                        <div className="font-semibold text-text-primary">
                          {n.jobType === 'INDEX_FACES' ? 'Face indexing complete' : n.jobType.replace(/_/g, ' ')}
                        </div>
                        <div className="text-[10px] text-muted mt-0.5">
                          {new Date(n.completedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Project actions — same actions already available from the
                sidebar's per-event "⋯", surfaced here too when a project is open */}
            {(onEditProject || onQuickShare || onAISort || onDeleteProject) && (
              <PhotoActionsMenu
                align="right"
                trigger={
                  <span title="Project options"
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted hover:text-accent hover:border-accent/40 hover:bg-accent/10 transition-colors cursor-pointer">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
                    </svg>
                  </span>
                }
                actions={[
                  ...(onEditProject ? [{
                    label: 'Edit project',
                    icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
                    onClick: () => onEditProject(project),
                  }] : []),
                  ...(onQuickShare ? [{
                    label: 'Quick Share',
                    icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>,
                    onClick: () => onQuickShare([project]),
                  }] : []),
                  ...(onAISort ? [{
                    label: 'AI Sorting / Search',
                    icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.344.344a.75.75 0 01-.53.22H9.75a.75.75 0 01-.53-.22l-.344-.344z" /></svg>,
                    onClick: () => onAISort([project]),
                  }] : []),
                  ...(onDeleteProject ? [{
                    label: 'Delete',
                    icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" /></svg>,
                    onClick: () => onDeleteProject([project]),
                    danger: true,
                  }] : []),
                ]}
              />
            )}

            {/* Close — clears the sidebar selection, replacing the old
                separate "clientName + Clear" bar above the grid so the
                grid itself gets that vertical space back. */}
            {onClose && (
              <button onClick={onClose} title="Close"
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted hover:text-red-500 hover:border-red-500/40 hover:bg-red-500/10 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
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
            {selectedIds.size > 0 ? (
              <p className="text-[11px] text-accent font-medium">{selectedIds.size} photo{selectedIds.size !== 1 ? 's' : ''} selected — client will only see these</p>
            ) : (
              <p className="text-[11px] text-yellow-500">Select photos in the grid first to share specific photos with the client</p>
            )}
            {shareError && <p className="text-[11px] text-red-500">{shareError}</p>}
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

        {shareUrl && (
          <div className="px-5 py-3 border-b border-border bg-success/5 flex items-center gap-3">
            <div className="flex-1 text-xs text-success font-mono truncate">{shareUrl}</div>
            <button onClick={copyLink} className="text-xs bg-success/20 hover:bg-success/30 text-success px-3 py-1.5 rounded-lg font-semibold transition-colors flex-shrink-0">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}

        {/* ── Upload zone ───────────────────────────────────────── */}
        {uploadOpen && activeTab === 'photos' && (
          <div className="mx-5 my-4 border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-accent/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}>
            <div className="text-3xl mb-2">📸</div>
            <div className="text-sm font-semibold text-text-primary">Drop photos here or click to upload</div>
            <div className="text-xs text-muted mt-1">JPG, PNG, WEBP, MP4 · Max 10GB per file</div>
            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={e => handleFiles(e.target.files)} />
          </div>
        )}

        {/* ── Upload progress ───────────────────────────────────── */}
        {uploads.length > 0 && (() => {
          const totalFiles = uploads.length; const doneFiles = uploads.filter(u => u.status === 'done').length
          const errFiles   = uploads.filter(u => u.status === 'error').length
          const totalBytes = uploads.reduce((s, u) => s + u.file.size, 0)
          const sentBytes  = uploads.reduce((s, u) => s + u.uploadedBytes, 0)
          const overallPct = totalBytes > 0 ? Math.round((sentBytes / totalBytes) * 100) : 0
          const allDone    = doneFiles + errFiles === totalFiles
          const eta        = uploadSpeed > 0 && !allDone ? (totalBytes - sentBytes) / uploadSpeed : 0
          return (
            <div className="px-5 pb-3 space-y-2">
              <div className="bg-bg border border-border rounded-xl px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-text-primary">
                    {allDone ? `${doneFiles} file${doneFiles !== 1 ? 's' : ''} uploaded${errFiles > 0 ? ` · ${errFiles} failed` : ' ✓'}` : `Uploading ${doneFiles + 1} of ${totalFiles} file${totalFiles !== 1 ? 's' : ''}`}
                  </span>
                  <button onClick={() => setUploadExpanded(v => !v)} className="flex items-center gap-1 text-xs text-muted hover:text-text-primary transition-colors flex-shrink-0">
                    <svg className={`w-3 h-3 transition-transform duration-200 ${uploadExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    Details
                  </button>
                </div>
                {!allDone && <div className="h-1.5 bg-border rounded-full overflow-hidden"><div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${overallPct}%` }} /></div>}
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{fmtBytes(sentBytes)} / {fmtBytes(totalBytes)}</span>
                  <div className="flex items-center gap-3">
                    {!allDone && uploadSpeed > 0 && <span>{fmtBytes(uploadSpeed)}/s{eta > 0 ? ` · ${fmtEta(eta)} left` : ''}</span>}
                    {!allDone && <span>{overallPct}%</span>}
                  </div>
                </div>
              </div>
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
                      {u.status === 'uploading' && <div className="h-0.5 bg-border rounded-full overflow-hidden"><div className="h-full bg-accent rounded-full transition-all" style={{ width: `${u.progress}%` }} /></div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

        {/* ══ TAB CONTENT ══════════════════════════════════════════ */}

        {/* ── All Photos tab ────────────────────────────────────── */}
        {activeTab === 'photos' && (
          <div className={`px-5 pb-5 ${expanded ? 'max-w-7xl mx-auto' : ''}`}>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : files.length === 0 ? (
              <p className="text-xs text-muted text-center py-6">No photos yet — upload above to get started.</p>
            ) : (
              <>
                {deleteError && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold mb-3 bg-red-500/10 text-red-500">
                    {deleteError}
                    <button onClick={() => setDeleteError(null)} className="ml-auto font-normal opacity-60 hover:opacity-100 transition-opacity">Dismiss ×</button>
                  </div>
                )}
                {viewFilter !== 'ALL' && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold mb-3 bg-accent/10 text-accent">
                    <PhotoScopeIcon scope={viewFilter} className="w-3.5 h-3.5 flex-shrink-0" />
                    {PHOTO_SCOPE_LABEL[viewFilter]}
                    <span className="font-normal text-current/70">— {displayFiles.length} photo{displayFiles.length !== 1 ? 's' : ''}</span>
                    <button onClick={() => setViewFilter('ALL')} className="ml-auto font-normal opacity-60 hover:opacity-100 transition-opacity">Clear ×</button>
                  </div>
                )}

                {/* Grid / List + floating zoom bar — fills down to roughly
                    the bottom of the viewport instead of stopping short,
                    while keeping its own independent scrollbar. Offset
                    shrunk from 130px since the tab row merged into the
                    header this session, freeing up vertical space above. */}
                <div className="vayu-scroll overflow-y-auto rounded-xl" style={{ maxHeight: expanded ? 'none' : 'calc(100vh - 90px)' }}>
                  <div className="flex items-start gap-3">


                    {/* Content */}
                    <div className="flex-1 min-w-0">
                    {viewMode === 'list' ? (
                      <div className="space-y-1 pt-[14px] pl-[14px] pr-[14px]">
                        {sortedDisplayFiles.map((f, idx) => {
                          const isSelected = selectedIds.has(f.fileId)
                          return (
                            <div key={f.fileId} onClick={() => togglePhoto(f.fileId)}
                              onDoubleClick={e => { e.stopPropagation(); setPreviewMode('all'); setAdminPreviewIdx(idx); setShowAdminPreview(true) }}
                              className={`flex items-center gap-3 px-2.5 py-2 rounded-xl cursor-pointer transition-colors ${isSelected ? 'bg-accent/10' : 'hover:bg-border/30'}`}>
                              <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors
                                ${isSelected ? 'bg-accent border-accent text-bg' : 'border-muted'}`}>
                                {isSelected && (
                                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                              <div className="w-11 h-11 rounded-lg overflow-hidden bg-border/40 flex-shrink-0">
                                {f.r2PreviewUrl
                                  ? <img src={f.r2PreviewUrl} alt={f.originalFilename} className="w-full h-full object-cover" draggable={false} />
                                  : <div className="w-full h-full flex items-center justify-center text-muted text-sm">📄</div>}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm text-text-primary truncate">{f.originalFilename}</div>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  {/* Original file size — the thumbnail is the watermarked preview, so this
                                      is the only place the admin sees the real original's size. */}
                                  <span className="text-[10px] text-muted font-medium">{fmtBytes(f.sizeBytes)}</span>
                                  {f.curationStatus && (
                                    <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent/15 text-accent">{f.curationStatus}</span>
                                  )}
                                  {(f.editedS3Key || f.editedR2Key) && <span className="text-[9px] text-muted">Edited</span>}
                                  {f.watermarkEnabled && <span className="text-[9px] text-muted">Watermarked</span>}
                                  {isMultiSource && (
                                    <span className="text-[9px] font-semibold text-accent uppercase">
                                      {(activeSourceProjects.find(p => p.projectId === f.projectId)?.eventType ?? '').replace(/_/g, ' ')}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button onClick={e => { e.stopPropagation(); downloadPhoto(f.fileId) }} title="Download"
                                className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg text-muted hover:text-accent hover:bg-accent/10 transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                              </button>
                              <button onClick={e => { e.stopPropagation(); deleteFiles([f.fileId]) }} title="Delete"
                                className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                              </button>
                              <button onClick={e => { e.stopPropagation(); cycleCurationStatus(f.fileId, f.curationStatus) }} title={curationMenuLabel(f.curationStatus)}
                                className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg text-muted hover:text-accent hover:bg-accent/10 transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-6 6m6-6l6 6" />
                                </svg>
                              </button>
                              <div onClick={e => e.stopPropagation()} className="flex-shrink-0">
                                <PhotoActionsMenu
                                  align="right"
                                  trigger={
                                    <span className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-text-primary hover:bg-border/50 cursor-pointer">
                                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                        <circle cx="12" cy="5" r="1.75" /><circle cx="12" cy="12" r="1.75" /><circle cx="12" cy="19" r="1.75" />
                                      </svg>
                                    </span>
                                  }
                                  actions={buildPhotoMenuActions(f, idx)}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                  <div ref={gridRef} className="relative select-none pt-[14px] pl-[14px] pr-[14px]"
                    style={{ display: 'grid', gridTemplateColumns: `repeat(${zoomLevel}, minmax(0, 1fr))`, gap: '14px' }}
                    onMouseDown={handleGridMouseDown}>
                    {sortedDisplayFiles.map((f, idx) => {
                      const isSelected  = selectedIds.has(f.fileId)
                      // A file sits at 'UPLOADING' for the first several
                      // seconds of any legitimate upload — only treat it as
                      // genuinely stuck once it's been that way a while.
                      const isStaleUpload = f.processingStatus === 'UPLOADING'
                        && (Date.now() - new Date(f.uploadedAt).getTime()) > STALE_UPLOAD_MS
                      const isGenuineFailure = f.processingStatus === 'FAILED'
                      const isFailed    = isGenuineFailure || isStaleUpload
                      const editComment = editCommentMap.get(f.fileId)
                      return (
                        <div key={f.fileId} data-fileid={f.fileId} onClick={() => handleTileClick(f.fileId)}
                          onDoubleClick={e => { e.stopPropagation(); setPreviewMode('all'); setAdminPreviewIdx(idx); setShowAdminPreview(true) }}
                          className={`group rounded-lg overflow-hidden bg-card border cursor-pointer transition-all duration-150 shadow-md hover:shadow-xl hover:-translate-y-0.5
                            ${isSelected ? 'border-accent ring-2 ring-accent/40' : 'border-border hover:border-border/80'}`}>
                          {/* Frame's top strip — real space above the photo, not overlaid on it */}
                          {!isFailed && (
                            <div data-no-drag="true" onClick={e => e.stopPropagation()}
                              className="flex items-center justify-between px-1 h-7 bg-border/25">
                              <button onClick={() => toggleStarred(f.fileId, f.curationStatus)}
                                title={f.curationStatus ? 'Unstar (Admin only)' : 'Star (Admin only)'}
                                className={`flex items-center justify-center p-1 -m-1 rounded-md transition-colors ${f.curationStatus ? 'text-yellow-400' : 'text-black hover:text-black/70'}`}>
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill={f.curationStatus ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.75}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.5a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.385a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                                </svg>
                              </button>
                              {isMultiSource && (
                                <span className="flex-1 min-w-0 text-center text-[9px] font-semibold text-muted uppercase truncate px-1">
                                  {(activeSourceProjects.find(p => p.projectId === f.projectId)?.eventType ?? '').replace(/_/g, ' ')}
                                </span>
                              )}
                              <PhotoActionsMenu
                                align="right"
                                trigger={
                                  <span className="text-black hover:text-black/70 cursor-pointer text-xs leading-none tracking-widest">
                                    •••
                                  </span>
                                }
                                actions={buildPhotoMenuActions(f, idx)}
                              />
                            </div>
                          )}

                          {/* Photo, inset with a thin frame on the sides/bottom */}
                          <div className="p-1 pt-0">
                            <div className="relative aspect-square rounded overflow-hidden bg-bg">
                              {f.r2PreviewUrl
                                ? <img src={f.r2PreviewUrl} alt={f.originalFilename} className="w-full h-full object-cover" draggable={false} />
                                : <div className="w-full h-full flex items-center justify-center">
                                    {(f.processingStatus === 'UPLOADING' || f.processingStatus === 'PROCESSING') && !isStaleUpload
                                      ? <div className="w-4 h-4 border-2 border-muted border-t-transparent rounded-full animate-spin" />
                                      : <span className="text-muted text-lg">📄</span>}
                                  </div>}
                              {f.processingStatus === 'PROCESSING' && f.r2PreviewUrl && (
                                <div className="absolute inset-0 bg-bg/50 flex items-center justify-center">
                                  <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                                </div>
                              )}
                              {isFailed && (
                                <div className="absolute inset-0 bg-bg/85 backdrop-blur-[1px] flex flex-col items-center justify-center gap-1.5 p-1">
                                  {retryingIds.has(f.fileId) ? (
                                    <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                                  ) : isGenuineFailure ? (
                                    <>
                                      <button onClick={e => { e.stopPropagation(); retryFile(f.fileId) }}
                                        title="Retry processing"
                                        className="w-7 h-7 flex items-center justify-center rounded-full bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 transition-colors">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                      </button>
                                      <span className="text-[8px] text-muted font-medium">Tap to retry</span>
                                      <button onClick={e => { e.stopPropagation(); deleteFiles([f.fileId]) }}
                                        className="text-[8px] text-muted/60 hover:text-red-400 transition-colors underline">
                                        Remove
                                      </button>
                                    </>
                                  ) : (
                                    // isStaleUpload — the raw upload itself never finished, so there
                                    // are no bytes in R2 to retry a watermark against. Only real
                                    // recovery is removing this record and re-selecting the file.
                                    <>
                                      <span className="text-[8px] text-muted font-medium text-center leading-tight">Upload didn't finish</span>
                                      <button onClick={e => { e.stopPropagation(); deleteFiles([f.fileId]) }}
                                        className="text-[8px] text-muted/60 hover:text-red-400 transition-colors underline">
                                        Remove
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                              {/* Always-visible checkbox (not just on hover/selected) — a reliable,
                                  drag-free way to build a multi-selection: just click each photo
                                  you want, one at a time. No need to hunt for empty space to drag. */}
                              <div className={`absolute top-1 left-1 w-4 h-4 rounded-full flex items-center justify-center shadow transition-colors
                                ${isSelected ? 'bg-accent' : 'bg-black/35 border border-white/70'}`}>
                                {isSelected && (
                                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                              {f.watermarkEnabled && (
                                <span className="absolute bottom-1 left-1 flex items-center gap-0.5 bg-black/55 text-white text-[8px] font-semibold px-1.5 py-0.5 rounded-md leading-tight">
                                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  Watermarked
                                </span>
                              )}
                              {editComment && (
                                <div className="absolute bottom-0 inset-x-0 bg-orange-900/90 px-1.5 py-1 text-[8px] text-orange-200 leading-tight line-clamp-2">
                                  {editComment}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {dragRect && (
                      <div className="absolute pointer-events-none border border-accent/70 bg-accent/10 rounded z-10"
                        style={{ left: dragRect.left, top: dragRect.top, width: dragRect.width, height: dragRect.height }} />
                    )}
                  </div>
                    )}
                    </div>
                  </div>
                </div>

              </>
            )}
          </div>
        )}

        {/* ── Face Index tab ────────────────────────────────────── */}
        {activeTab === 'faces' && (
          <div className="px-5 py-5 space-y-5">
            {faceLoading ? (
              <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
            ) : faceFeatureOff ? (
              <div className="text-center py-10 space-y-3">
                <div className="text-5xl">🔒</div>
                <p className="text-sm font-bold text-text-primary">AI Face Search</p>
                <p className="text-xs text-muted">This feature is not enabled on your plan.</p>
              </div>
            ) : (
              <>
                {/* Trigger button */}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-text-primary">Face Index</p>
                    <p className="text-xs text-muted mt-0.5">Index faces so guests can find their photos by selfie.</p>
                  </div>
                  {!isIndexing && (
                    <button onClick={triggerFaceIndexing} disabled={faceTriggering}
                      className="flex items-center gap-2 bg-accent text-bg text-sm font-semibold px-4 py-2 rounded-xl hover:bg-accent/90 disabled:opacity-50 transition-colors flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.344.344a.75.75 0 01-.53.22H9.75a.75.75 0 01-.53-.22l-.344-.344z" />
                      </svg>
                      {neverRun ? 'Generate Face Index' : faceTriggering ? 'Starting…' : 'Re-index'}
                    </button>
                  )}
                </div>

                {faceError && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">{faceError}</div>}

                {isIndexing && (
                  <div className="bg-accent/10 border border-accent/30 rounded-xl px-5 py-4 flex items-center gap-4">
                    <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{faceStatus?.activeJob?.status === 'PENDING' ? 'Queued…' : 'Indexing faces…'}</p>
                      <p className="text-xs text-muted mt-0.5">This runs in the background.</p>
                    </div>
                  </div>
                )}

                {faceStatus && (
                  <div className="border border-border rounded-2xl divide-y divide-border overflow-hidden">
                    <div className="px-5 py-3 flex items-center justify-between">
                      <span className="text-sm text-muted">Photos indexed</span>
                      <span className="text-sm font-bold text-text-primary">{faceStatus.indexedPhotos} / {faceStatus.totalPhotos}</span>
                    </div>
                    <div className="px-5 py-3 flex items-center justify-between">
                      <span className="text-sm text-muted">Status</span>
                      <span className={`text-sm font-bold ${isIndexing ? 'text-accent' : isReady ? 'text-success' : hasPartial ? 'text-yellow-400' : 'text-muted'}`}>
                        {isIndexing ? 'Indexing…' : isReady ? '✓ Ready for guest search' : hasPartial ? `${faceStatus.pendingPhotos} pending` : 'Not indexed yet'}
                      </span>
                    </div>
                    {faceStatus.lastCompletedAt && (
                      <div className="px-5 py-3 flex items-center justify-between">
                        <span className="text-sm text-muted">Last indexed</span>
                        <span className="text-sm text-text-primary">{new Date(faceStatus.lastCompletedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      </div>
                    )}
                  </div>
                )}

                {neverRun && !faceError && !faceLoading && (
                  <div className="border border-dashed border-border rounded-2xl p-8 text-center space-y-3">
                    <div className="text-4xl">🔍</div>
                    <p className="text-sm font-bold text-text-primary">No faces indexed yet</p>
                    <p className="text-xs text-muted">Guests can upload a selfie to find their photos once you run the index.</p>
                  </div>
                )}

                {isReady && (
                  <div className="bg-success/5 border border-success/20 rounded-2xl px-5 py-4 space-y-1">
                    <p className="text-sm font-bold text-success">✓ Face index ready</p>
                    <p className="text-xs text-muted">Guests can now tap <strong className="text-text-primary">Find My Photos</strong> in the gallery.</p>
                  </div>
                )}

                {/* QR code generator */}
                {(isReady || hasPartial) && (
                  <div className="border border-border rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-border bg-border/10">
                      <p className="text-sm font-bold text-text-primary">Guest QR Code</p>
                      <p className="text-xs text-muted mt-0.5">Guests scan and find their photos via selfie.</p>
                    </div>
                    <div className="px-5 py-4 space-y-4">
                      <div className="flex items-center gap-3">
                        <label className="text-xs text-muted font-semibold flex-shrink-0">Expires in</label>
                        <select value={qrExpiry} onChange={e => { setQrExpiry(Number(e.target.value) as 12 | 24 | 48); setQrDataUrl(null) }}
                          className="bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent/60">
                          <option value={12}>12 hours</option><option value={24}>24 hours</option><option value={48}>48 hours</option>
                        </select>
                        <button onClick={generateQr} disabled={qrGenerating}
                          className="flex-1 bg-accent text-bg text-sm font-bold py-2 rounded-xl hover:bg-accent/90 disabled:opacity-50 transition-colors">
                          {qrGenerating ? 'Generating…' : qrDataUrl ? 'Regenerate QR' : 'Generate QR Code'}
                        </button>
                      </div>
                      {qrDataUrl && qrGuestUrl && (
                        <div className="flex flex-col items-center gap-4 pt-2">
                          <div className="bg-white p-3 rounded-2xl shadow-md">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={qrDataUrl} alt="Guest QR Code" width={200} height={200} />
                          </div>
                          {qrExpiresAt && <p className="text-xs text-muted">Expires {new Date(qrExpiresAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>}
                          <div className="flex gap-2 w-full">
                            <button onClick={async () => { if (!qrGuestUrl) return; await navigator.clipboard.writeText(qrGuestUrl); setQrCopied(true); setTimeout(() => setQrCopied(false), 2000) }}
                              className="flex-1 text-xs border border-border text-muted font-semibold py-2.5 rounded-xl hover:bg-border/40 transition-colors">
                              {qrCopied ? '✓ Copied!' : '🔗 Copy Link'}
                            </button>
                            <button onClick={() => { if (!qrDataUrl) return; const a = document.createElement('a'); a.href = qrDataUrl; a.download = `guest-qr-${project.projectId}.png`; document.body.appendChild(a); a.click(); document.body.removeChild(a) }}
                              className="flex-1 text-xs border border-border text-muted font-semibold py-2.5 rounded-xl hover:bg-border/40 transition-colors">
                              ⬇ Download QR
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Selections tab ────────────────────────────────────── */}
        {activeTab === 'selections' && (
          <div className="px-5 py-5 space-y-5">
            {selItemsLoading ? (
              <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
            ) : !selItems || selItems.length === 0 ? (
              <div className="text-center py-10 space-y-3">
                <div className="text-4xl">💌</div>
                <p className="text-sm font-bold text-text-primary">No selections yet</p>
                <p className="text-xs text-muted">Client hasn&apos;t submitted their selection. Share the gallery link first.</p>
              </div>
            ) : (
              <>
                {/* Stats */}
                <div className="flex gap-3 text-xs text-muted flex-wrap">
                  <span className="font-semibold text-text-primary">{selItems.length} photos selected</span>
                  {selItems.filter(i => i.selection.editingRequired).length > 0 && (
                    <span className="text-yellow-400">{selItems.filter(i => i.selection.editingRequired).length} need editing</span>
                  )}
                </div>

                {/* Needs editing */}
                {selItems.filter(i => i.selection.editingRequired).length > 0 && (
                  <div ref={needsEditingRef} className="space-y-3 scroll-mt-6">
                    <p className="text-sm font-semibold text-text-primary">
                      ✏️ Needs Editing
                      <span className="text-xs text-muted font-normal ml-2">
                        ({selItems.filter(i => i.selection.editingRequired && (!!(i.file.editedS3Key || i.file.editedR2Key) || editUploadStates.get(i.file.fileId)?.status === 'done')).length}/{selItems.filter(i => i.selection.editingRequired).length} done)
                      </span>
                    </p>
                    {selItems.filter(i => i.selection.editingRequired).map(({ selection, file }) => {
                      const upState = editUploadStates.get(file.fileId) ?? { status: 'idle' as const, progress: 0 }
                      const isEditedDone = !!(file.editedS3Key || file.editedR2Key) || upState.status === 'done'
                      return (
                        <div key={file.fileId} className="bg-bg border border-border rounded-xl p-3 flex gap-3">
                          <div className="w-16 h-16 rounded-lg overflow-hidden bg-card border border-border flex-shrink-0">
                            {file.r2PreviewUrl
                              ? <img src={file.r2PreviewUrl} alt="" className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center text-muted text-xs">📄</div>}
                          </div>
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <p className="text-xs font-medium text-text-primary truncate">{file.originalFilename}</p>
                            {selection.comment && (
                              <p className="text-[11px] text-muted italic">&ldquo;{selection.comment}&rdquo;</p>
                            )}
                            <div className="flex items-center gap-2 flex-wrap">
                              {isEditedDone && (
                                <span className="text-xs text-success font-semibold">✓ Edited version uploaded</span>
                              )}
                              <button
                                onClick={() => downloadOriginalEdit(file.fileId)}
                                className="text-xs bg-card border border-border text-text-primary px-3 py-1.5 rounded-lg hover:border-accent hover:text-accent transition-colors"
                              >
                                ↓ Download Original
                              </button>
                              <label className="text-xs bg-accent text-bg font-semibold px-3 py-1.5 rounded-lg hover:bg-accent/90 transition-colors cursor-pointer">
                                {isEditedDone ? '↑ Re-upload Edited' : '↑ Upload Edited'}
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  ref={(el) => { if (el) editFileInputRefs.current.set(file.fileId, el) }}
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
                                <div className="text-[11px] text-muted">{upState.progress}%</div>
                              </div>
                            )}
                            {upState.status === 'error' && (
                              <div className="text-[11px] text-danger">{upState.error}</div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Final selects grid */}
                {selItems.filter(i => !i.selection.editingRequired).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-text-primary">Final Selects</p>
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                      {selItems.filter(i => !i.selection.editingRequired).map(({ file, selection }) => (
                        <div key={file.fileId} className="relative aspect-square rounded-lg overflow-hidden bg-card border border-border" title={selection.comment || file.originalFilename}>
                          {file.r2PreviewUrl
                            ? <img src={file.r2PreviewUrl} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-muted text-xs">📄</div>}
                          {selection.comment && (
                            <div className="absolute bottom-1 right-1 w-4 h-4 bg-accent/80 rounded-full flex items-center justify-center text-bg text-[8px]">💬</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Print link */}
                <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <div>
                    <p className="text-sm font-bold text-text-primary">Print Portal</p>
                    <p className="text-xs text-muted mt-0.5">Generate a 7-day link for your print partner to download all finals.</p>
                  </div>
                  {printUrl ? (
                    <div className="flex items-center gap-2 bg-success/10 border border-success/30 rounded-lg px-3 py-2">
                      <span className="flex-1 text-xs text-success font-mono truncate">{printUrl}</span>
                      <button onClick={async () => { await navigator.clipboard.writeText(printUrl); setPrintCopied(true); setTimeout(() => setPrintCopied(false), 2000) }}
                        className="text-xs bg-success/20 hover:bg-success/30 text-success px-3 py-1.5 rounded-lg font-semibold transition-colors flex-shrink-0">
                        {printCopied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {printBlockedMessage && (
                        <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-lg p-3 text-xs text-yellow-400">
                          ⚠️ {printBlockedMessage}
                        </div>
                      )}
                      <button onClick={generatePrintLink} disabled={printGenerating}
                        className="bg-accent text-bg font-bold px-5 py-2.5 rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-50 text-sm">
                        {printGenerating ? 'Generating…' : 'Generate Print Link'}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Raw Transfers tab ─────────────────────────────────── */}
        {activeTab === 'transfers' && (
          <div className="p-5 space-y-4">
            <p className="text-xs text-muted">
              Send large RAW files to anyone, or request one back — no login required for the other side, no watermarking.
            </p>

            {transfersError && (
              <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-sm text-danger">{transfersError}</div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => transferFileInputRef.current?.click()}
                disabled={!!sendTransferProgress}
                className="flex-1 bg-accent text-bg text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-accent/90 disabled:opacity-50 transition-colors"
              >
                ⬆ Send Raw File
              </button>
              <input
                ref={transferFileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) sendTransferFile(f); e.target.value = '' }}
              />
              <button
                onClick={requestTransferFile}
                disabled={requestingTransfer}
                className="flex-1 border border-border text-text-primary text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-border/40 disabled:opacity-50 transition-colors"
              >
                {requestingTransfer ? 'Creating…' : '📥 Request File'}
              </button>
            </div>

            {sendTransferProgress && (
              <div className="border border-border rounded-xl px-4 py-3 space-y-2">
                <div className="text-sm text-text-primary break-all">{sendTransferProgress.filename}</div>
                <div className="w-full bg-bg border border-border rounded-full h-2 overflow-hidden">
                  <div className="bg-accent h-full transition-all" style={{ width: `${sendTransferProgress.percent}%` }} />
                </div>
                <div className="text-xs text-muted">Uploading… {sendTransferProgress.percent}%</div>
              </div>
            )}

            {transfersLoading && transfers === null ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (transfers ?? []).length === 0 && !sendTransferProgress ? (
              <div className="border border-dashed border-border rounded-2xl p-8 text-center space-y-2">
                <div className="text-3xl">📁</div>
                <p className="text-sm text-muted">No transfers yet for this event.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(transfers ?? []).map(t => (
                  <div key={t.transferId} className="border border-border rounded-xl p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full border border-border text-muted">
                            {t.direction === 'SEND' ? '⬆ Sent' : '📥 Requested'}
                          </span>
                          <span className={`text-xs font-semibold ${
                            t.status === 'READY' ? 'text-success' :
                            t.status === 'UPLOADING' ? 'text-accent' :
                            t.status === 'FAILED' || t.status === 'EXPIRED' ? 'text-danger' : 'text-muted'
                          }`}>
                            {t.status === 'PENDING' ? 'Awaiting upload' :
                             t.status === 'UPLOADING' ? 'Uploading…' :
                             t.status === 'READY' ? 'Ready' :
                             t.status === 'FAILED' ? 'Failed' : 'Expired'}
                          </span>
                          {t.importedToGallery && <span className="text-xs font-semibold text-success">✓ In gallery</span>}
                        </div>
                        <div className="text-sm text-text-primary font-medium mt-1 truncate">
                          {t.filename ?? (t.direction === 'RECEIVE' ? 'Waiting for upload…' : '—')}
                        </div>
                        <div className="text-xs text-muted mt-0.5">
                          {t.sizeBytes ? fmtBytes(t.sizeBytes) : '—'} · {fmtDate(t.createdAt)}
                          {t.direction === 'SEND' && t.downloadCount > 0 && ` · downloaded ${t.downloadCount}×`}
                        </div>
                        {t.note && <div className="text-xs text-muted italic mt-1">"{t.note}"</div>}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap pt-1">
                      {(t.status === 'PENDING' || t.status === 'READY') && (
                        <button onClick={() => copyTransferLink(t)}
                          className="text-xs border border-border text-muted font-semibold px-3 py-1.5 rounded-lg hover:bg-border/40 transition-colors">
                          {transferCopiedId === t.transferId ? '✓ Copied!' : '🔗 Copy Link'}
                        </button>
                      )}
                      {t.status !== 'UPLOADING' && (
                        <button onClick={() => resendTransfer(t.transferId)} disabled={transfersBusyId === t.transferId}
                          className="text-xs border border-border text-muted font-semibold px-3 py-1.5 rounded-lg hover:bg-border/40 disabled:opacity-50 transition-colors">
                          ↻ Resend
                        </button>
                      )}
                      {t.direction === 'RECEIVE' && t.status === 'READY' && !t.importedToGallery && (
                        <button onClick={() => importTransferToGallery(t.transferId)} disabled={transfersBusyId === t.transferId}
                          className="text-xs bg-accent text-bg font-semibold px-3 py-1.5 rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors">
                          {transfersBusyId === t.transferId ? 'Importing…' : '+ Import to Gallery'}
                        </button>
                      )}
                      {!t.importedToGallery && (
                        <button onClick={() => removeTransfer(t.transferId)} disabled={transfersBusyId === t.transferId}
                          className="text-xs border border-danger/30 text-danger font-semibold px-3 py-1.5 rounded-lg hover:bg-danger/10 disabled:opacity-50 transition-colors">
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>{/* end card */}

      {/* ── Floating selection pill (admin grid) ──────────────── */}
      {selectedCount > 0 && activeTab === 'photos' && !hidePill && (
        <div className="fixed bottom-5 inset-x-4 z-30 flex justify-center">
          <div className="bg-accent shadow-[0_10px_30px_-6px_rgba(0,0,0,0.45)] rounded-2xl overflow-hidden w-full max-w-md">
            <div className="flex items-center gap-0.5 px-2 py-2">

              {/* × clear */}
              <button onClick={() => onSelectionChange(new Set())}
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl text-white/85 hover:text-white hover:bg-white/15 transition-colors" aria-label="Clear selection">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Count + select-all dropdown — compact trigger with a
                  spacer after it so the gap before the star icon isn't
                  itself one giant clickable "select all" button */}
              <PhotoActionsMenu
                align="left"
                direction="up"
                trigger={
                  <span title="Select all" className="flex items-center gap-1 pl-1 pr-2 py-1.5 rounded-xl text-white hover:bg-white/15 transition-colors cursor-pointer">
                    <span className="text-xs font-bold whitespace-nowrap">{selectedCount} selected</span>
                    <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </span>
                }
                actions={[
                  { label: 'Select all', icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>, onClick: () => onSelectionChange(new Set(sortedDisplayFiles.map(f => f.fileId))) },
                  ...(isMultiSource ? activeSourceProjects.map(p => ({
                    label: `Select all — ${p.clientName} (${(p.eventType ?? '').replace(/_/g, ' ')})`,
                    icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>,
                    onClick: () => onSelectionChange(new Set(sortedDisplayFiles.filter(f => f.projectId === p.projectId).map(f => f.fileId))),
                  })) : []),
                ]}
              />
              <div className="flex-1" />

              {/* ★ Star (bulk toggle) */}
              <button onClick={bulkToggleStar} title={allSelectedStarred ? 'Unstar selected' : 'Star selected'}
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl text-white/85 hover:text-white hover:bg-white/15 transition-colors">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill={allSelectedStarred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.5a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.385a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
              </button>

              {/* 🄫 Watermark (bulk) */}
              <PhotoActionsMenu
                align="right"
                direction="up"
                trigger={
                  <span className="w-8 h-8 flex items-center justify-center rounded-xl text-white/85 hover:text-white hover:bg-white/15 transition-colors cursor-pointer" aria-label="Watermark options">
                    {bulkWatermarking
                      ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>}
                  </span>
                }
                actions={[
                  { label: 'Apply Watermark', icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>, onClick: () => bulkApplyWatermark(true) },
                  { label: 'Remove Watermark', icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>, onClick: () => bulkApplyWatermark(false) },
                ]}
              />

              {/* ✨ AI Sorting/Search (bulk) */}
              <button onClick={bulkAISort} title="Run AI Sorting on selected photos"
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl text-white/85 hover:text-white hover:bg-white/15 transition-colors">
                {bulkAISorting
                  ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.344.344a.75.75 0 01-.53.22H9.75a.75.75 0 01-.53-.22l-.344-.344z" />
                    </svg>}
              </button>

              {/* 📤 Quick Share (opens share setup) */}
              <button onClick={() => { setShowShareSetup(true) }} title="Quick Share selected photos"
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl text-white/85 hover:text-white hover:bg-white/15 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                </svg>
              </button>

              {/* ⋯ More — everything else from the per-photo/per-event menus
                  that still makes sense in bulk */}
              <PhotoActionsMenu
                align="right"
                direction="up"
                trigger={
                  <span className="flex items-center gap-0.5 w-8 h-8 flex-shrink-0 justify-center rounded-xl text-white/85 hover:text-white hover:bg-white/15 transition-colors cursor-pointer" aria-label="More options">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
                    </svg>
                  </span>
                }
                actions={[
                  { label: 'Preview selected',
                    icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
                    onClick: () => { setPreviewMode('selected'); setAdminPreviewIdx(0); setShowAdminPreview(true) } },
                  { label: 'Download selected',
                    icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>,
                    onClick: bulkDownloadSelected },
                  { label: 'Delete selected', danger: true,
                    icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>,
                    onClick: () => setDeleteMode('selected') },
                ]}
              />

            </div>
          </div>
        </div>
      )}
    </>
  )
}
