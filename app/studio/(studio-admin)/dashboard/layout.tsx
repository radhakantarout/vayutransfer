'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { StudioProject, MediaFile } from '@/types/studio'
import AddEventModal from './AddEventModal'
import EditEventModal from './EditEventModal'
import EventSection from './EventSection'
import PhotoActionsMenu from '@/components/studio/PhotoActionsMenu'
import DeleteProjectModal from '@/components/studio/DeleteProjectModal'
import QuickShareModal from '@/components/studio/QuickShareModal'
import AISortingModal from '@/components/studio/AISortingModal'
import EditClientModal from '@/components/studio/EditClientModal'

const STATUS_DOT: Record<string, string> = {
  DRAFT:              'bg-muted',
  ACTIVE:             'bg-accent',
  SELECTION_RECEIVED: 'bg-yellow-400',
  COMPLETED:          'bg-success',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function CheckIcon() {
  return (
    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

// Collapsed-sidebar icon-only rail button — shows a hover tooltip/flyout with
// the full label (and optionally richer content via `flyout`).
function RailItem({
  icon, label, active, onClick, href, flyout,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  onClick?: () => void
  href?: string
  flyout?: React.ReactNode
}) {
  const className = `group/rail relative w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
    active ? 'bg-accent/10 text-accent' : 'text-muted hover:text-text-primary hover:bg-border/50'
  }`
  const tooltip = !flyout && (
    <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 rounded-lg bg-text-primary text-bg text-xs font-semibold whitespace-nowrap opacity-0 invisible group-hover/rail:opacity-100 group-hover/rail:visible transition-all duration-150 z-30 shadow-lg pointer-events-none">
      {label}
    </span>
  )
  const content = (
    <>
      {icon}
      {tooltip}
      {flyout}
    </>
  )
  if (href) {
    return <Link href={href} onClick={onClick} className={className} title={label}>{content}</Link>
  }
  if (onClick) {
    return <button onClick={onClick} className={className} title={label}>{content}</button>
  }
  // Hover-only trigger (e.g. a flyout with its own nested buttons/links) —
  // must not be a <button> itself, or the nested interactive elements would
  // produce invalid nested-button HTML.
  return <div className={className} title={label}>{content}</div>
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  )
}
function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  )
}
function AIIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.344.344a.75.75 0 01-.53.22H9.75a.75.75 0 01-.53-.22l-.344-.344z" />
    </svg>
  )
}
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
    </svg>
  )
}
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
function DotsIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
    </svg>
  )
}

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
}

function ClientBranch({
  clientName, projects, selectedIds, onToggle, onAddEvent, onEditEvent,
  onDeleteEvents, onQuickShare, onAISort, onEditClient, onCancelSchedule,
}: {
  clientName: string
  projects: StudioProject[]
  selectedIds: string[]
  onToggle: (id: string) => void
  onAddEvent: (name: string) => void
  onEditEvent: (p: StudioProject) => void
  onDeleteEvents: (projects: StudioProject[]) => void
  onQuickShare: (projects: StudioProject[]) => void
  onAISort: (projects: StudioProject[]) => void
  onEditClient: (projects: StudioProject[]) => void
  onCancelSchedule: (p: StudioProject) => void
}) {
  const anySelected = projects.some(p => selectedIds.includes(p.projectId))
  const [open, setOpen] = useState(anySelected)

  // Auto-open branch when an event inside gets selected externally
  useEffect(() => { if (anySelected) setOpen(true) }, [anySelected])

  return (
    <div className="group/branch">
      {/* Client row */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-border/50 transition-colors">
        <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1.5 flex-1 min-w-0 text-left">
          <svg className={`w-3 h-3 text-muted flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-semibold text-text-primary truncate flex-1">{clientName}</span>
        </button>
        <span className="text-[10px] text-muted">{projects.length}</span>
        <button onClick={() => onAddEvent(clientName)} title="Add event"
          className="w-4 h-4 flex items-center justify-center rounded text-muted hover:text-accent hover:bg-accent/10 transition-all flex-shrink-0">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <PhotoActionsMenu
          align="right"
          trigger={
            <button title="Client options" className="w-4 h-4 flex items-center justify-center rounded text-muted hover:text-accent hover:bg-accent/10 transition-all flex-shrink-0">
              <DotsIcon />
            </button>
          }
          actions={[
            { label: 'Edit client info',      icon: <EditIcon />,  onClick: () => onEditClient(projects) },
            { label: `Quick Share (all ${projects.length})`, icon: <ShareIcon />, onClick: () => onQuickShare(projects) },
            { label: `AI Sorting (all ${projects.length})`,  icon: <AIIcon />,    onClick: () => onAISort(projects) },
            { label: `Delete all ${projects.length} events`, icon: <TrashIcon />, onClick: () => onDeleteEvents(projects), danger: true },
          ]}
        />
      </div>

      {/* Event rows */}
      {open && (
        <div className="ml-3 pl-2.5 border-l border-border/50 space-y-px mt-px">
          {projects.map(p => {
            const selected = selectedIds.includes(p.projectId)
            return (
              <div
                key={p.projectId}
                onClick={() => onToggle(p.projectId)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors group/event
                  ${selected ? 'bg-accent/15' : 'hover:bg-border/50'}`}
              >
                {/* Checkbox */}
                <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors
                  ${selected ? 'bg-accent border-accent text-bg' : 'border-muted group-hover/event:border-text-primary'}`}>
                  {selected && <CheckIcon />}
                </div>

                {/* Status dot */}
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[p.status] ?? 'bg-muted'}`} />

                {/* Event info */}
                <div className="min-w-0 flex-1">
                  <div className={`text-xs truncate leading-tight font-medium ${selected ? 'text-accent' : 'text-muted group-hover/event:text-text-primary'}`}>
                    {p.eventType.replace(/_/g, ' ')}
                  </div>
                  <div className="text-[10px] text-muted leading-tight">{fmtDate(p.eventDate)}</div>
                </div>

                {/* Scheduled-delete badge */}
                {p.scheduledDeleteAt && (
                  <span title={`Deletes automatically in ${daysUntil(p.scheduledDeleteAt)} day(s)`}
                    className="flex items-center gap-0.5 text-[9px] font-semibold text-yellow-500 bg-yellow-500/10 rounded px-1 py-0.5 flex-shrink-0 leading-tight">
                    <span className="w-2.5 h-2.5"><ClockIcon /></span>
                    {daysUntil(p.scheduledDeleteAt)}d
                  </span>
                )}

                {/* File count badge */}
                {p.totalFiles > 0 && (
                  <span className="text-[9px] text-muted bg-border/60 rounded px-1 py-0.5 flex-shrink-0 leading-tight">
                    {p.totalFiles}
                  </span>
                )}

                {/* "⋯" menu — on hover */}
                <div className="opacity-0 group-hover/event:opacity-100 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <PhotoActionsMenu
                    align="right"
                    trigger={
                      <button title="Event options" className="w-4 h-4 flex items-center justify-center rounded text-muted hover:text-accent hover:bg-accent/10 transition-all">
                        <DotsIcon />
                      </button>
                    }
                    actions={[
                      { label: 'Edit project',    icon: <EditIcon />,  onClick: () => onEditEvent(p) },
                      { label: 'Quick Share',     icon: <ShareIcon />, onClick: () => onQuickShare([p]) },
                      { label: 'AI Sorting / Search', icon: <AIIcon />, onClick: () => onAISort([p]) },
                      ...(p.scheduledDeleteAt
                        ? [{ label: 'Cancel scheduled deletion', icon: <ClockIcon />, onClick: () => onCancelSchedule(p) }]
                        : []),
                      { label: 'Delete', icon: <TrashIcon />, onClick: () => onDeleteEvents([p]), danger: true },
                    ]}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const SIDEBAR_KEY = 'studio_sidebar_open'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname  = usePathname()
  const router    = useRouter()

  const [projects, setProjects]         = useState<StudioProject[]>([])
  const [authChecked, setAuthChecked]   = useState(false)
  const [treeOpen, setTreeOpen]         = useState(true)
  const [sidebarOpen, setSidebarOpen]   = useState(true)
  const [selectedIds, setSelectedIds]   = useState<string[]>([])
  const [modalClient, setModalClient]   = useState<string | null>(null)
  const [editProject, setEditProject]   = useState<StudioProject | null>(null)
  // Project "⋯" menu modals — each holds the target project(s): length 1 for
  // a single event, or all of a client's projects for the client-level menu.
  const [deleteModalProjects, setDeleteModalProjects]         = useState<StudioProject[] | null>(null)
  const [shareModalProjects, setShareModalProjects]           = useState<StudioProject[] | null>(null)
  const [aiModalProjects, setAiModalProjects]                 = useState<StudioProject[] | null>(null)
  const [editClientModalProjects, setEditClientModalProjects] = useState<StudioProject[] | null>(null)
  // Cross-event photo selection: projectId → Set<fileId>
  const [photoSelections, setPhotoSelections] = useState<Map<string, Set<string>>>(new Map())
  const [projectFiles, setProjectFiles]       = useState<Map<string, MediaFile[]>>(new Map())
  const [refreshTriggers, setRefreshTriggers] = useState<Map<string, number>>(new Map())
  // Global pill modals
  const [showGlobalPreview, setShowGlobalPreview] = useState(false)
  const [globalPreviewIdx, setGlobalPreviewIdx]   = useState(0)
  const [showGlobalDelete, setShowGlobalDelete]   = useState(false)
  const [globalDeleting, setGlobalDeleting]       = useState(false)
  const [shareTargetProjectId, setShareTargetProjectId] = useState<string | null>(null)
  const [shareError, setShareError]             = useState<string | null>(null)
  const [shareSuccess, setShareSuccess]         = useState<string | null>(null)
  const [sharing, setSharing]                   = useState(false)
  const sidebarWrapRef                          = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_KEY)
    if (saved === 'false') setSidebarOpen(false)
  }, [])

  // Auto-close sidebar when clicking anywhere outside it (or its toggle tab)
  useEffect(() => {
    if (!sidebarOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (sidebarWrapRef.current && !sidebarWrapRef.current.contains(e.target as Node)) {
        setSidebarOpen(false)
        localStorage.setItem(SIDEBAR_KEY, 'false')
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [sidebarOpen])

  // Sync sidebar selection to URL — runs on every navigation so "recent activity" links auto-select
  useEffect(() => {
    const match = pathname.match(/\/studio\/dashboard\/projects\/([^/]+)/)
    if (match && match[1] && match[1] !== 'new') {
      setSelectedIds(prev => prev.includes(match[1]) ? prev : [match[1]])
    } else if (pathname === '/studio/dashboard') {
      setSelectedIds([])
    }
  }, [pathname])

  const toggleSidebar = () => {
    setSidebarOpen(v => { localStorage.setItem(SIDEBAR_KEY, String(!v)); return !v })
  }

  const fetchProjects = () => {
    fetch('/studio/api/admin/projects')
      .then(r => {
        if (r.status === 401 || r.status === 403) {
          router.replace(`/studio/login?next=${encodeURIComponent(pathname)}`)
          return null
        }
        setAuthChecked(true)
        return r.json()
      })
      .then(d => { if (d?.success) setProjects(d.data) })
      .catch(() => {})
  }

  useEffect(() => { fetchProjects() }, [pathname])

  const handleCancelSchedule = async (p: StudioProject) => {
    await fetch(`/studio/api/admin/projects/${p.projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledDeleteAt: null }),
    })
    fetchProjects()
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const clearSelection = () => {
    setSelectedIds([])
    setPhotoSelections(new Map())
  }

  const handleSelectionChange = (projectId: string) => (ids: Set<string>) => {
    setPhotoSelections(prev => {
      const next = new Map(prev)
      if (ids.size === 0) next.delete(projectId)
      else next.set(projectId, ids)
      return next
    })
  }

  const handleFilesLoaded = (projectId: string) => (files: MediaFile[]) => {
    setProjectFiles(prev => new Map(prev).set(projectId, files))
  }

  const totalPhotoSelected = Array.from(photoSelections.values()).reduce((acc, s) => acc + s.size, 0)

  // All selected photos flattened in order (for global preview)
  const allSelectedPhotos = Array.from(photoSelections.entries()).flatMap(([pid, ids]) =>
    (projectFiles.get(pid) ?? []).filter(f => ids.has(f.fileId))
  )

  const deleteAllSelected = async () => {
    setGlobalDeleting(true)
    await Promise.all(
      Array.from(photoSelections.entries()).flatMap(([pid, ids]) =>
        Array.from(ids).map(fid =>
          fetch(`/studio/api/admin/projects/${pid}/files/${fid}`, { method: 'DELETE' })
        )
      )
    )
    // Bump refreshTrigger for every affected project so EventSections reload
    setRefreshTriggers(prev => {
      const next = new Map(prev)
      Array.from(photoSelections.keys()).forEach(pid => next.set(pid, (next.get(pid) ?? 0) + 1))
      return next
    })
    setPhotoSelections(new Map())
    setShowGlobalDelete(false)
    setGlobalDeleting(false)
    fetchProjects()
  }

  const handleGlobalShare = async () => {
    const pids = Array.from(photoSelections.keys())
    if (pids.length === 0) return

    // Validate all selected events belong to the same client
    const selectedEventsForShare = pids.map(pid => selectedProjects.find(p => p.projectId === pid)).filter(Boolean) as StudioProject[]
    const emails = Array.from(new Set(selectedEventsForShare.map(p => p.clientEmail)))
    if (emails.length > 1) {
      setShareError('Selected events belong to different clients. Please select events for one client at a time before sharing.')
      return
    }

    setShareError(null)
    setSharing(true)

    // Generate share tokens for all selected events in parallel
    const results = await Promise.all(
      pids.map(async (pid) => {
        const selIds = photoSelections.get(pid)
        const includedFileIds = selIds ? Array.from(selIds) : []
        const res = await fetch(`/studio/api/admin/projects/${pid}/share-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expiryDays: 30, includedFileIds }),
        }).then(r => r.json())
        return { pid, res }
      })
    )

    setSharing(false)
    const failed = results.filter(r => !r.res.success)
    if (failed.length > 0) {
      setShareError(failed[0].res.message ?? 'Failed to generate share link. Please try again.')
      return
    }

    // Use the first event's share URL (client opens overview and sees all events)
    const firstUrl = results[0]?.res?.data?.shareUrl ?? ''
    setShareSuccess(firstUrl)
    fetchProjects()
  }

  const clientGroups = (() => {
    const map = new Map<string, StudioProject[]>()
    for (const p of projects) {
      const key = p.clientName || 'Unknown'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return Array.from(map.entries()).sort((a, b) => {
      const la = Math.max(...a[1].map(p => new Date(p.updatedAt).getTime()))
      const lb = Math.max(...b[1].map(p => new Date(p.updatedAt).getTime()))
      return lb - la
    })
  })()

  const selectedProjects = selectedIds
    .map(id => projects.find(p => p.projectId === id))
    .filter((p): p is StudioProject => !!p)

  if (!authChecked) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">

      <div ref={sidebarWrapRef} className="flex flex-shrink-0">

      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside className={`bg-card border-r border-border flex-shrink-0 flex flex-col transition-all duration-200 ease-in-out ${sidebarOpen ? 'w-56 overflow-hidden' : 'w-12 overflow-visible'}`}>

        {!sidebarOpen && (
          /* ── Collapsed icon rail ─────────────────────────────── */
          <div className="flex flex-col items-center gap-1 pt-3 px-1.5">
            <RailItem
              label="Dashboard"
              active={pathname === '/studio/dashboard' && selectedIds.length === 0}
              onClick={() => { clearSelection(); router.push('/studio/dashboard') }}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              }
            />
            <RailItem
              label="My Projects"
              href="/studio/dashboard/projects"
              onClick={clearSelection}
              active={pathname === '/studio/dashboard/projects'}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                </svg>
              }
            />
            <RailItem
              label="My Website"
              href="/studio/dashboard/website"
              onClick={clearSelection}
              active={pathname.startsWith('/studio/dashboard/website')}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
                </svg>
              }
            />
            <RailItem
              label="My Booking"
              href="/studio/dashboard/bookings"
              onClick={clearSelection}
              active={pathname.startsWith('/studio/dashboard/bookings')}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              }
            />

            <div className="w-6 h-px bg-border my-1.5" />

            <RailItem
              label={`Projects (${projects.length})`}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
                </svg>
              }
              flyout={
                <div className="absolute left-full top-0 ml-2 w-64 max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-card shadow-2xl opacity-0 invisible group-hover/rail:opacity-100 group-hover/rail:visible transition-all duration-150 z-30 p-2">
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <span className="text-[11px] font-bold text-muted uppercase tracking-widest">Projects</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted">{projects.length}</span>
                      <Link href="/studio/dashboard/projects/new" title="New project" onClick={clearSelection}
                        className="w-4 h-4 flex items-center justify-center rounded text-muted hover:text-accent hover:bg-accent/10 transition-all">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {clientGroups.length === 0 ? (
                      <p className="text-[11px] text-muted px-3 py-2">No projects yet</p>
                    ) : (
                      clientGroups.map(([clientName, clientProjects]) => (
                        <div key={clientName}>
                          <div className="px-2 py-1 text-xs font-semibold text-text-primary truncate">{clientName}</div>
                          {clientProjects.map(p => (
                            <button
                              key={p.projectId}
                              onClick={() => toggleSelect(p.projectId)}
                              className={`w-full text-left px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors ${
                                selectedIds.includes(p.projectId)
                                  ? 'bg-accent/10 text-accent'
                                  : 'text-muted hover:text-text-primary hover:bg-border/50'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[p.status] ?? 'bg-muted'}`} />
                              <span className="truncate flex-1">{fmtDate(p.eventDate)} · {p.eventType.replace(/_/g, ' ')}</span>
                            </button>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              }
            />
          </div>
        )}

        {sidebarOpen && (
        <>
        {/* Dashboard nav */}
        <nav className="px-2 pt-3 pb-2 space-y-0.5 border-b border-border">
          <button
            onClick={() => { clearSelection(); router.push('/studio/dashboard') }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname === '/studio/dashboard' && selectedIds.length === 0
                ? 'bg-accent/10 text-accent'
                : 'text-muted hover:text-text-primary hover:bg-border/50'
            }`}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            Dashboard
          </button>
          <Link href="/studio/dashboard/projects" onClick={clearSelection}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname === '/studio/dashboard/projects'
                ? 'bg-accent/10 text-accent'
                : 'text-muted hover:text-text-primary hover:bg-border/50'
            }`}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
            My Projects
          </Link>
          <Link href="/studio/dashboard/website" onClick={clearSelection}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname.startsWith('/studio/dashboard/website')
                ? 'bg-accent/10 text-accent'
                : 'text-muted hover:text-text-primary hover:bg-border/50'
            }`}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
            </svg>
            My Website
          </Link>
          <Link href="/studio/dashboard/bookings" onClick={clearSelection}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname.startsWith('/studio/dashboard/bookings')
                ? 'bg-accent/10 text-accent'
                : 'text-muted hover:text-text-primary hover:bg-border/50'
            }`}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            My Booking
          </Link>
        </nav>

        {/* Projects tree */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center px-3 py-2 group/header">
            <button onClick={() => setTreeOpen(v => !v)} className="flex items-center gap-1.5 flex-1 min-w-0 hover:opacity-80 transition-opacity">
              <svg className={`w-3 h-3 text-muted flex-shrink-0 transition-transform duration-150 ${treeOpen ? 'rotate-90' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-[11px] font-bold text-muted uppercase tracking-widest">Projects</span>
            </button>
            <span className="text-[10px] text-muted mr-1.5">{projects.length}</span>
            <Link href="/studio/dashboard/projects/new" title="New project" onClick={clearSelection}
              className="w-4 h-4 flex items-center justify-center rounded text-muted hover:text-accent hover:bg-accent/10 transition-all flex-shrink-0">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
              </svg>
            </Link>
          </div>

          {treeOpen && (
            <div className="px-1.5 pb-3 space-y-px">
              {clientGroups.length === 0 ? (
                <p className="text-[11px] text-muted px-3 py-2">No projects yet</p>
              ) : (
                clientGroups.map(([clientName, clientProjects]) => (
                  <ClientBranch
                    key={clientName}
                    clientName={clientName}
                    projects={clientProjects}
                    selectedIds={selectedIds}
                    onToggle={toggleSelect}
                    onAddEvent={setModalClient}
                    onEditEvent={setEditProject}
                    onDeleteEvents={setDeleteModalProjects}
                    onQuickShare={setShareModalProjects}
                    onAISort={setAiModalProjects}
                    onEditClient={setEditClientModalProjects}
                    onCancelSchedule={handleCancelSchedule}
                  />
                ))
              )}
            </div>
          )}
        </div>
        </>
        )}

      </aside>

      {/* ── Sidebar toggle tab ───────────────────────────────── */}
      <div className="relative flex-shrink-0">
        <button onClick={toggleSidebar} title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          className="absolute top-4 -left-px z-10 flex flex-col items-center gap-1 px-1 py-2 bg-card border border-border rounded-r-md text-muted hover:text-text-primary hover:bg-border/60 transition-colors shadow-sm">
          <svg className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 ${sidebarOpen ? '' : 'rotate-180'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="flex flex-col items-center leading-[1.1]">
            {(sidebarOpen ? 'CLOSE' : 'OPEN').split('').map((ch, i) => (
              <span key={i} className="text-[8px] font-bold tracking-wide">{ch}</span>
            ))}
          </span>
        </button>
      </div>

      </div>

      {/* ── Main content ─────────────────────────────────────── */}
      {selectedIds.length > 0 ? (
        <main className="flex-1 overflow-auto bg-bg">
          <div className="px-6 py-6 space-y-6">
            {/* Selection bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-text-primary">
                  {selectedIds.length === 1
                    ? selectedProjects[0]?.clientName
                    : `${selectedIds.length} events selected`}
                </span>
                {selectedIds.length > 1 && (
                  <span className="text-xs text-muted">
                    · {Array.from(new Set(selectedProjects.map(p => p.clientName))).join(', ')}
                  </span>
                )}
              </div>
              <button onClick={() => { clearSelection(); router.push('/studio/dashboard') }}
                className="text-xs text-muted hover:text-text-primary border border-border px-2.5 py-1 rounded-lg hover:bg-border/40 transition-colors">
                Clear
              </button>
            </div>

            {/* Event sections */}
            {selectedProjects.map(p => (
              <EventSection
                key={p.projectId}
                project={p}
                onUpdated={fetchProjects}
                selectedIds={photoSelections.get(p.projectId) ?? new Set()}
                onSelectionChange={handleSelectionChange(p.projectId)}
                onFilesLoaded={handleFilesLoaded(p.projectId)}
                refreshTrigger={refreshTriggers.get(p.projectId) ?? 0}
                hidePill={true}
                triggerShare={shareTargetProjectId === p.projectId}
                onShareTriggered={() => setShareTargetProjectId(null)}
              />
            ))}
          </div>
        </main>
      ) : (
        <main className="flex-1 overflow-auto bg-bg">{children}</main>
      )}

      {/* ── Modals ───────────────────────────────────────────── */}
      {modalClient && (
        <AddEventModal
          clientName={modalClient}
          existingProjects={projects}
          onClose={() => setModalClient(null)}
          onCreated={(projectId) => {
            setModalClient(null)
            fetchProjects()
            setSelectedIds([projectId])
          }}
        />
      )}

      {editProject && (
        <EditEventModal
          project={editProject}
          onClose={() => setEditProject(null)}
          onSaved={() => { setEditProject(null); fetchProjects() }}
        />
      )}

      {deleteModalProjects && (
        <DeleteProjectModal
          projects={deleteModalProjects}
          onClose={() => setDeleteModalProjects(null)}
          onDeleted={() => { setDeleteModalProjects(null); fetchProjects() }}
        />
      )}

      {shareModalProjects && (
        <QuickShareModal
          projects={shareModalProjects}
          onClose={() => setShareModalProjects(null)}
        />
      )}

      {aiModalProjects && (
        <AISortingModal
          projects={aiModalProjects}
          onClose={() => setAiModalProjects(null)}
        />
      )}

      {editClientModalProjects && (
        <EditClientModal
          projects={editClientModalProjects}
          onClose={() => setEditClientModalProjects(null)}
          onSaved={() => { setEditClientModalProjects(null); fetchProjects() }}
        />
      )}

      {/* ── Global selection pill (all events combined) ──────── */}
      {totalPhotoSelected > 0 && (
        <div className="fixed bottom-5 inset-x-4 z-40 flex justify-center">
          <div className="bg-card/85 backdrop-blur-xl border border-border/70 rounded-2xl shadow-2xl overflow-hidden w-full max-w-sm">
            <div className="flex items-center gap-1 px-2 py-2.5">

              {/* × clear */}
              <button onClick={() => setPhotoSelections(new Map())}
                className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl hover:bg-border/60 transition-colors text-muted hover:text-text-primary" aria-label="Clear selection">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Count */}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-bold text-text-primary">{totalPhotoSelected} selected</span>
                {photoSelections.size > 1 && (
                  <span className="text-[11px] text-muted ml-1.5">· {photoSelections.size} events</span>
                )}
              </div>

              {/* 👁 Preview */}
              <button onClick={() => { setGlobalPreviewIdx(0); setShowGlobalPreview(true) }}
                className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl hover:bg-border/60 transition-colors text-muted hover:text-text-primary" aria-label="Preview selected">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>

              {/* Divider */}
              <div className="w-px h-6 bg-border/60 flex-shrink-0" />

              {/* 🗑 Delete */}
              <button onClick={() => setShowGlobalDelete(true)}
                className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl hover:bg-red-500/15 transition-colors text-red-500/70 hover:text-red-500" aria-label="Delete selected">
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>

              {/* 📤 Share */}
              <button
                onClick={handleGlobalShare}
                disabled={sharing}
                className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl hover:bg-accent/15 transition-colors text-accent/70 hover:text-accent disabled:opacity-50" aria-label="Share with client">
                {sharing
                  ? <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  : <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                    </svg>
                }
              </button>

            </div>

            {/* Share error */}
            {shareError && (
              <div className="px-3 pb-2.5 flex items-start gap-2">
                <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                <p className="text-[11px] text-red-500 leading-snug">{shareError}</p>
                <button onClick={() => setShareError(null)} className="ml-auto text-muted hover:text-text-primary flex-shrink-0">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            )}

            {/* Share success */}
            {shareSuccess && (
              <div className="px-3 pb-2.5 flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-success flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-[11px] text-success font-semibold flex-1 truncate">Shared! Client can view all events</p>
                <button onClick={async () => { await navigator.clipboard.writeText(shareSuccess); setShareSuccess(null) }}
                  className="text-[11px] text-accent font-semibold hover:underline flex-shrink-0">Copy link</button>
                <button onClick={() => setShareSuccess(null)} className="text-muted hover:text-text-primary flex-shrink-0">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Global preview lightbox ───────────────────────────── */}
      {showGlobalPreview && allSelectedPhotos.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={() => setShowGlobalPreview(false)}>
          <div className="flex items-center justify-between px-4 py-3" onClick={e => e.stopPropagation()}>
            <span className="text-white/70 text-sm">{globalPreviewIdx + 1} / {allSelectedPhotos.length}</span>
            <button onClick={() => setShowGlobalPreview(false)} className="text-white/70 hover:text-white">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setGlobalPreviewIdx(i => Math.max(0, i - 1))}
              className="absolute left-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <img
              src={allSelectedPhotos[globalPreviewIdx]?.r2PreviewUrl ?? ''}
              alt={allSelectedPhotos[globalPreviewIdx]?.originalFilename}
              className="max-h-[80vh] max-w-[85vw] object-contain rounded-lg"
            />
            <button onClick={() => setGlobalPreviewIdx(i => Math.min(allSelectedPhotos.length - 1, i + 1))}
              className="absolute right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── Global delete confirm ─────────────────────────────── */}
      {showGlobalDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-card rounded-2xl border border-border shadow-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-base font-bold text-text-primary">Delete {totalPhotoSelected} photo{totalPhotoSelected !== 1 ? 's' : ''}?</h3>
            <p className="text-sm text-muted">This will permanently delete the selected photos{photoSelections.size > 1 ? ` across ${photoSelections.size} events` : ''}. This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowGlobalDelete(false)} disabled={globalDeleting}
                className="flex-1 text-sm border border-border py-2 rounded-xl hover:bg-border/40 transition-colors text-muted disabled:opacity-50">
                Cancel
              </button>
              <button onClick={deleteAllSelected} disabled={globalDeleting}
                className="flex-1 text-sm bg-red-500 text-white font-bold py-2 rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50">
                {globalDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
