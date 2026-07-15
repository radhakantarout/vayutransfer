'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
import StudioTopupModal from '@/components/studio/StudioTopupModal'
import ProfileMenu from '@/components/studio/ProfileMenu'
import EditProfileModal from '@/components/studio/EditProfileModal'
import { useExpandedGrid } from '@/components/studio/ExpandedGridContext'

interface NotificationItem {
  jobId: string
  jobType: string
  projectId: string
  completedAt: string
}

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
function GalleryIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
    </svg>
  )
}
function WebsiteIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
    </svg>
  )
}
function BookingIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
  )
}
function BellIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  )
}
function HelpIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.783.38-1.45 1.02-1.45 1.887V14M12 17h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
}

function fmtBytes(bytes: number): string {
  if (!bytes) return '0 GB'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

// Reads the non-httpOnly `studio_ui` cookie set at login ({role, name, email})
// — avoids a "who am I" API round trip for something already in the browser.
function readStudioUiCookie(): { role?: string; name?: string; email?: string } | null {
  const match = document.cookie.match(/(?:^|; )studio_ui=([^;]*)/)
  if (!match) return null
  try {
    return JSON.parse(decodeURIComponent(match[1]))
  } catch {
    return null
  }
}

// Flat (non-client-grouped) row for the Recent/Starred sidebar views — same
// visual language as ClientBranch's own event row, just standalone with the
// client name inline instead of a group header.
function FlatProjectRow({
  project, selectedIds, onToggle, onEditEvent, onDeleteEvents, onQuickShare, onAISort, onCancelSchedule,
}: {
  project: StudioProject
  selectedIds: string[]
  onToggle: (id: string) => void
  onEditEvent: (p: StudioProject) => void
  onDeleteEvents: (projects: StudioProject[]) => void
  onQuickShare: (projects: StudioProject[]) => void
  onAISort: (projects: StudioProject[]) => void
  onCancelSchedule: (p: StudioProject) => void
}) {
  const p = project
  const selected = selectedIds.includes(p.projectId)
  return (
    <div
      onClick={() => onToggle(p.projectId)}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors group/event
        ${selected ? 'bg-accent/15' : 'hover:bg-border/50'}`}
    >
      <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors
        ${selected ? 'bg-accent border-accent text-bg' : 'border-muted group-hover/event:border-text-primary'}`}>
        {selected && <CheckIcon />}
      </div>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[p.status] ?? 'bg-muted'}`} />
      <div className="min-w-0 flex-1">
        <div className={`text-xs truncate leading-tight font-medium ${selected ? 'text-accent' : 'text-muted group-hover/event:text-text-primary'}`}>
          {p.clientName} · {(p.eventType ?? '').replace(/_/g, ' ')}
        </div>
        <div className="text-[10px] text-muted leading-tight">{fmtDate(p.eventDate)}</div>
      </div>
      {p.totalFiles > 0 && (
        <span className="text-[9px] text-muted bg-border/60 rounded px-1 py-0.5 flex-shrink-0 leading-tight">
          {p.totalFiles}
        </span>
      )}
      <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
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
                    {(p.eventType ?? '').replace(/_/g, ' ')}
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

                {/* "⋯" menu — always visible, used frequently */}
                <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname  = usePathname()
  const router    = useRouter()
  const { setNavCollapsed } = useExpandedGrid()

  const [projects, setProjects]         = useState<StudioProject[]>([])
  const [authChecked, setAuthChecked]   = useState(false)
  const [sidebarView, setSidebarView]   = useState<'dashboard' | 'recent' | 'starred' | 'projects'>('projects')
  const [selectedIds, setSelectedIds]   = useState<string[]>([])
  const [stats, setStats]               = useState<{ storageUsedBytes: number; storageGrantBytes: number; aiSearchCreditsUsed: number; aiSearchCreditsTotal: number } | null>(null)
  const [topupKind, setTopupKind]       = useState<'storage' | 'ai-search' | null>(null)
  const [userInfo, setUserInfo]         = useState<{ role?: string; name?: string; email?: string } | null>(null)
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [sidebarNotifications, setSidebarNotifications] = useState<NotificationItem[]>([])
  const [showSidebarNotif, setShowSidebarNotif] = useState(false)
  const [notifPos, setNotifPos] = useState<{ top: number; left: number } | null>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const [profilePhone, setProfilePhone] = useState('')
  const [modalClient, setModalClient]   = useState<string | null>(null)
  const [editProject, setEditProject]   = useState<StudioProject | null>(null)
  // Project "⋯" menu modals — each holds the target project(s): length 1 for
  // a single event, or all of a client's projects for the client-level menu.
  const [deleteModalProjects, setDeleteModalProjects]         = useState<StudioProject[] | null>(null)
  const [shareModalProjects, setShareModalProjects]           = useState<StudioProject[] | null>(null)
  const [aiModalProjects, setAiModalProjects]                 = useState<StudioProject[] | null>(null)
  const [editClientModalProjects, setEditClientModalProjects] = useState<StudioProject[] | null>(null)
  // Shared grid zoom + view mode — one of each applied to every EventSection
  // open at once (multi-select view), so zooming/switching one affects all
  // of them together. The floating zoom bar itself renders once here, not
  // per-event, to avoid stacking duplicate fixed-position widgets.
  const [zoomLevel, setZoomLevel] = useState(6)
  const [gridViewMode, setGridViewMode] = useState<'grid' | 'list'>('grid')
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
  const zoomTrackRef                            = useRef<HTMLDivElement>(null)

  // Drag the zoom bar's dot up/down the track to set zoom directly, instead
  // of only being able to step it one column at a time via +/-. Handles
  // both mouse and touch since the bar is visible on mobile too.
  const handleZoomTrackDrag = (e: React.MouseEvent | React.TouchEvent) => {
    const track = zoomTrackRef.current
    if (!track) return
    const getClientY = (ev: MouseEvent | TouchEvent) => 'touches' in ev ? ev.touches[0].clientY : ev.clientY
    const updateFromY = (clientY: number) => {
      const rect = track.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
      setZoomLevel(Math.round(2 + ratio * 8))
    }
    updateFromY('touches' in e ? e.touches[0].clientY : e.clientY)
    const onMove = (ev: MouseEvent | TouchEvent) => { updateFromY(getClientY(ev)); ev.preventDefault() }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove as EventListener)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove as EventListener)
      window.removeEventListener('touchend', onUp)
    }
    window.addEventListener('mousemove', onMove as EventListener)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove as EventListener, { passive: false })
    window.addEventListener('touchend', onUp)
    e.preventDefault()
  }

  const loadStats = () => {
    fetch('/studio/api/admin/stats')
      .then(r => r.json())
      .then(d => { if (d?.success) setStats(d.data.billing) })
      .catch(() => {})
  }

  // Storage widget + user footer — both use data that's already fetchable
  // (existing /admin/stats route, existing studio_ui cookie set at login),
  // just not previously surfaced anywhere in the sidebar.
  useEffect(() => {
    setUserInfo(readStudioUiCookie())
    loadStats()
  }, [])

  // Sync sidebar selection to URL — runs on every navigation so "recent activity" links auto-select
  useEffect(() => {
    const match = pathname.match(/\/studio\/dashboard\/projects\/([^/]+)/)
    if (match && match[1] && match[1] !== 'new') {
      setSelectedIds(prev => prev.includes(match[1]) ? prev : [match[1]])
    } else if (pathname === '/studio/dashboard') {
      setSelectedIds([])
    }
  }, [pathname])

  // Keep the Dashboard tab's highlight in sync with direct navigation/refresh
  // (e.g. visiting /overview straight from a bookmark) — clicking Recent/
  // Starred/Projects afterwards doesn't change the URL, so it won't re-fire
  // this and fight with those tabs' own highlight.
  useEffect(() => {
    if (pathname === '/studio/dashboard/overview') setSidebarView('dashboard')
  }, [pathname])

  // Auto-hide the top navbar to give an open gallery more room, and re-hide
  // it any time the actual selection changes (a fresh "select event" action)
  // — the admin can still peek at it via the SHOW tab (rendered by
  // StudioChrome) without that overriding this effect, since it only fires
  // when selectedIds itself changes, not on every render.
  useEffect(() => {
    setNavCollapsed(selectedIds.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds.join(',')])

  const handleLogout = async () => {
    await fetch('/studio/api/auth/logout', { method: 'POST' })
    router.push('/studio/login')
  }

  const openEditProfile = async () => {
    const res = await fetch('/studio/api/auth/me').then(r => r.json()).catch(() => null)
    setProfilePhone(res?.data?.phone ?? '')
    setShowEditProfile(true)
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

  // Studio-wide notification bell — aggregates the same per-project
  // /admin/notifications route EventSection already uses, across every
  // project this studio has (small studios, cheap to do in parallel).
  const projectIdsKey = projects.map(p => p.projectId).join(',')
  useEffect(() => {
    if (projects.length === 0) { setSidebarNotifications([]); return }
    let cancelled = false
    Promise.all(
      projects.map(p =>
        fetch(`/studio/api/admin/notifications?projectId=${p.projectId}`)
          .then(r => r.json())
          .then(d => (d?.success ? d.data.notifications : []) as NotificationItem[])
          .catch(() => [] as NotificationItem[])
      )
    ).then(lists => {
      if (cancelled) return
      setSidebarNotifications(lists.flat().sort((a, b) => b.completedAt.localeCompare(a.completedAt)))
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdsKey])

  useEffect(() => {
    if (!showSidebarNotif) return
    const onDocClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowSidebarNotif(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [showSidebarNotif])

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

  const recentProjects = [...projects]
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    .slice(0, 10)
  const starredProjects = projects.filter(p => p.isStarred)

  const selectedProjects = selectedIds
    .map(id => projects.find(p => p.projectId === id))
    .filter((p): p is StudioProject => !!p)

  // Which product is active — drives the sidebar's simplified shape (the
  // Projects tree only makes sense in Gallery mode; Settings/Storage/AI-usage/
  // profile stay visible in every mode).
  const activeProduct: 'gallery' | 'website' | 'bookings' = pathname.startsWith('/studio/dashboard/website')
    ? 'website'
    : pathname.startsWith('/studio/dashboard/bookings')
      ? 'bookings'
      : 'gallery'
  const PRODUCT_LABEL: Record<typeof activeProduct, string> = {
    gallery: 'Client Gallery', website: 'My Website', bookings: 'My Booking',
  }
  const PRODUCT_ICON: Record<typeof activeProduct, React.ReactNode> = {
    gallery: <GalleryIcon />, website: <WebsiteIcon />, bookings: <BookingIcon />,
  }

  if (!authChecked) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // The product-picker landing page renders full-bleed, no sidebar — it's the
  // very first thing an admin sees after login, before choosing a product.
  if (pathname === '/studio/dashboard') {
    return <div className="flex-1 overflow-auto bg-bg">{children}</div>
  }

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 bg-card flex flex-col overflow-hidden shadow-[4px_0_24px_-6px_rgba(0,0,0,0.12)] z-10">

        {/* Logo + product switcher — one compact header block, no divider
            between them; real VayuStudios brand mark (same as the marketing
            navbar's logo.png), not a placeholder icon. Bell/help/profile sit
            right next to the brand name, not at the sidebar's bottom. */}
        <div className="px-3 pt-4 pb-3 border-b border-border flex-shrink-0 space-y-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <Link href="/studio/home" className="flex items-center gap-1.5 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="VayuStudios" className="w-5 h-5 rounded-md flex-shrink-0 shadow-sm" />
              <span className="text-sm font-extrabold leading-none text-text-primary truncate">
                Vayu<span className="text-accent">Studios</span>
              </span>
            </Link>

            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Notifications — aggregated across every project this studio has.
                  Portal-rendered (not a plain absolute div) because the
                  sidebar's own overflow-hidden — needed to keep the project
                  tree scrolling internally — was clipping an in-place dropdown. */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => {
                    if (!showSidebarNotif) {
                      const rect = notifRef.current?.getBoundingClientRect()
                      // Anchor by left, not right — the trigger sits in a
                      // narrow ~256px sidebar, so aligning the (also 256px
                      // wide) popup's right edge to the trigger pushed its
                      // left edge off-screen. Plenty of room to the right.
                      if (rect) setNotifPos({ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 256 - 8) })
                    }
                    setShowSidebarNotif(v => !v)
                  }}
                  title="Notifications"
                  className="relative w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-accent hover:bg-border/50 transition-colors">
                  <BellIcon />
                  {sidebarNotifications.length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[8px] font-bold">
                      {sidebarNotifications.length}
                    </span>
                  )}
                </button>
                {showSidebarNotif && notifPos && typeof document !== 'undefined' && createPortal(
                  <div
                    style={{ position: 'fixed', top: notifPos.top, left: notifPos.left, width: 256 }}
                    className="bg-card border border-border rounded-xl shadow-2xl py-1.5 z-[100] max-h-64 overflow-y-auto">
                    {sidebarNotifications.length === 0 ? (
                      <p className="text-xs text-muted px-3 py-2">No recent activity</p>
                    ) : (
                      sidebarNotifications.map(n => (
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
                  </div>,
                  document.body
                )}
              </div>

              {/* Help — direct line to support */}
              <a href="https://wa.me/918984769522" target="_blank" rel="noopener noreferrer" title="Help & support"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-accent hover:bg-border/50 transition-colors">
                <HelpIcon />
              </a>

              {/* Profile — same Settings/Edit profile/Billing/Logout menu,
                  now a small icon here instead of a bottom-anchored row */}
              {userInfo && (
                <ProfileMenu
                  position="below"
                  align="right"
                  onEditProfile={openEditProfile}
                  onLogout={handleLogout}
                  trigger={
                    <div className="w-7 h-7 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[11px] font-bold cursor-pointer uppercase">
                      {userInfo.name?.slice(0, 1) ?? '?'}
                    </div>
                  }
                />
              )}
            </div>
          </div>

          <PhotoActionsMenu
            align="left"
            trigger={
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border/60 bg-card text-[11px] font-semibold text-text-primary shadow-sm hover:shadow-md hover:border-accent/30 cursor-pointer transition-all">
                <span className="w-3 h-3 text-accent flex-shrink-0">{PRODUCT_ICON[activeProduct]}</span>
                {PRODUCT_LABEL[activeProduct]}
                <svg className="w-2.5 h-2.5 text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M8 15l4 4 4-4" />
                </svg>
              </span>
            }
            menuClassName="w-48"
            actions={[
              { label: 'Client Gallery', icon: <GalleryIcon />, onClick: () => { clearSelection(); setSidebarView('projects'); router.push('/studio/dashboard/projects') } },
              { label: 'My Website', icon: <WebsiteIcon />, onClick: () => { clearSelection(); router.push('/studio/dashboard/website') } },
              { label: 'My Booking', icon: <BookingIcon />, onClick: () => { clearSelection(); router.push('/studio/dashboard/bookings') } },
            ]}
          />
        </div>

        {/* Current project card — only when exactly one event is open */}
        {selectedIds.length === 1 && selectedProjects[0] && (
          <button onClick={() => { clearSelection(); router.push('/studio/dashboard/overview') }} title="Back to dashboard"
            className="mx-3 mt-3 p-2.5 rounded-xl bg-card border border-border/60 shadow-sm flex items-center gap-2.5 text-left hover:shadow-md transition-all flex-shrink-0">
            <div className="w-9 h-9 rounded-lg bg-accent/15 text-accent flex items-center justify-center text-xs font-bold flex-shrink-0 uppercase">
              {selectedProjects[0].clientName?.slice(0, 2) ?? '??'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold text-accent uppercase tracking-wide truncate">{(selectedProjects[0].eventType ?? '').replace(/_/g, ' ')}</div>
              <div className="text-xs font-semibold text-text-primary truncate">{selectedProjects[0].clientName}</div>
              <div className="text-[10px] text-muted truncate">{fmtDate(selectedProjects[0].eventDate)}</div>
            </div>
          </button>
        )}

        {/* Client Gallery mode: a Dashboard shortcut + Recent/Starred/Projects
            tabs, replacing a single fixed "Projects" tree header.
            min-h-0 is required here: without it, a flex child with
            overflow-y-auto still refuses to shrink below its content's
            natural height (flexbox's default min-height:auto), so a long
            project list was overflowing past the sidebar's own bounds and
            getting silently clipped by <aside>'s overflow-hidden — taking
            Settings/Storage/AI/profile down with it. */}
        {activeProduct === 'gallery' && (
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
            <div className="px-2 pt-1 flex-shrink-0 space-y-1.5">
              <Link href="/studio/dashboard/overview" onClick={() => { clearSelection(); setSidebarView('dashboard') }}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  sidebarView === 'dashboard'
                    ? 'bg-accent/10 text-accent'
                    : 'text-muted hover:text-text-primary hover:bg-border/50'
                }`}>
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
                Dashboard
              </Link>

              <div className="flex items-center gap-1 px-0.5">
                {(['recent', 'starred', 'projects'] as const).map(view => (
                  <button key={view} onClick={() => {
                    setSidebarView(view)
                    // "Projects" also opens the My Projects cover-card
                    // overview in the main content area — same destination
                    // as picking "Client Gallery" from the dropdown above.
                    if (view === 'projects') { clearSelection(); router.push('/studio/dashboard/projects') }
                  }}
                    className={`flex-1 text-[11px] font-bold uppercase tracking-wide py-1.5 rounded-lg transition-colors ${
                      sidebarView === view ? 'bg-accent/10 text-accent' : 'text-muted hover:text-text-primary hover:bg-border/50'
                    }`}>
                    {view === 'recent' ? 'Recent' : view === 'starred' ? 'Starred' : 'Projects'}
                  </button>
                ))}
              </div>
            </div>

            {sidebarView === 'projects' && (
              <div className="flex items-center px-3 pt-2 pb-1 group/header flex-shrink-0">
                <span className="text-[10px] text-muted flex-1">{projects.length} total</span>
                <Link href="/studio/dashboard/projects/new" title="New project" onClick={clearSelection}
                  className="w-4 h-4 flex items-center justify-center rounded text-muted hover:text-accent hover:bg-accent/10 transition-all flex-shrink-0">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                  </svg>
                </Link>
              </div>
            )}

            <div className="px-1.5 pb-3 space-y-px flex-1">
              {sidebarView === 'projects' && (
                clientGroups.length === 0 ? (
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
                )
              )}

              {sidebarView === 'recent' && (
                recentProjects.length === 0 ? (
                  <p className="text-[11px] text-muted px-3 py-2">No projects yet</p>
                ) : (
                  recentProjects.map(p => (
                    <FlatProjectRow
                      key={p.projectId}
                      project={p}
                      selectedIds={selectedIds}
                      onToggle={toggleSelect}
                      onEditEvent={setEditProject}
                      onDeleteEvents={setDeleteModalProjects}
                      onQuickShare={setShareModalProjects}
                      onAISort={setAiModalProjects}
                      onCancelSchedule={handleCancelSchedule}
                    />
                  ))
                )
              )}

              {sidebarView === 'starred' && (
                starredProjects.length === 0 ? (
                  <p className="text-[11px] text-muted px-3 py-2">No starred projects yet</p>
                ) : (
                  starredProjects.map(p => (
                    <FlatProjectRow
                      key={p.projectId}
                      project={p}
                      selectedIds={selectedIds}
                      onToggle={toggleSelect}
                      onEditEvent={setEditProject}
                      onDeleteEvents={setDeleteModalProjects}
                      onQuickShare={setShareModalProjects}
                      onAISort={setAiModalProjects}
                      onCancelSchedule={handleCancelSchedule}
                    />
                  ))
                )
              )}
            </div>
          </div>
        )}

        {/* Non-gallery modes have no tree — let their own page fill the
            remaining space so Settings/Storage/AI-usage/profile still pin
            to the bottom instead of floating under a short sidebar. */}
        {activeProduct !== 'gallery' && <div className="flex-1" />}

        {/* Pinned bottom group — Settings / Storage / AI-usage. Profile now
            lives in the top header row instead, next to the brand name.
            One divider separating it from the scrollable area above; no
            lines splitting the items apart, just spacing between them. */}
        <div className="border-t border-border flex-shrink-0 px-2 py-2 space-y-1.5">
          <Link href="/studio/dashboard/settings" onClick={clearSelection}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              pathname.startsWith('/studio/dashboard/settings')
                ? 'bg-accent/10 text-accent'
                : 'text-muted hover:text-text-primary hover:bg-border/50'
            }`}>
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </Link>

          {stats && (
            <div className="px-2.5 py-1.5 rounded-lg bg-border/25">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-semibold text-muted uppercase tracking-wide">Storage</span>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-muted">{fmtBytes(stats.storageUsedBytes)} / {fmtBytes(stats.storageGrantBytes)}</span>
                  <button onClick={() => setTopupKind('storage')} title="Top up storage"
                    className="w-3 h-3 flex items-center justify-center rounded-full bg-accent/15 text-accent hover:bg-accent/25 transition-colors flex-shrink-0">
                    <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="h-1 rounded-full bg-border overflow-hidden">
                <div className="h-full bg-accent rounded-full"
                  style={{ width: `${stats.storageGrantBytes > 0 ? Math.min(100, (stats.storageUsedBytes / stats.storageGrantBytes) * 100) : 0}%` }} />
              </div>
            </div>
          )}

          {/* AI search (face-indexing) usage — real cumulative count from the
              indexing Lambda's faceIndexed flag, aggregated across every
              project, against a purchasable credit pool. */}
          {stats && (
            <div className="px-2.5 py-1.5 rounded-lg bg-border/25">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-semibold text-muted uppercase tracking-wide">AI Search</span>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-muted">{stats.aiSearchCreditsUsed} / {stats.aiSearchCreditsTotal}</span>
                  <button onClick={() => setTopupKind('ai-search')} title="Top up AI search credits"
                    className="w-3 h-3 flex items-center justify-center rounded-full bg-accent/15 text-accent hover:bg-accent/25 transition-colors flex-shrink-0">
                    <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="h-1 rounded-full bg-border overflow-hidden">
                <div className={`h-full rounded-full ${stats.aiSearchCreditsUsed > stats.aiSearchCreditsTotal ? 'bg-danger' : 'bg-accent'}`}
                  style={{ width: `${stats.aiSearchCreditsTotal > 0 ? Math.min(100, (stats.aiSearchCreditsUsed / stats.aiSearchCreditsTotal) * 100) : 0}%` }} />
              </div>
            </div>
          )}
        </div>

      </aside>

      {/* ── Main content ─────────────────────────────────────── */}
      {selectedIds.length > 0 ? (
        <main className="flex-1 overflow-auto bg-card">
          <div className="px-6 pt-2 pb-6 space-y-6">
            {/* One EventSection always — same look whether 1 or several
                events are selected. The host is the first selected project
                (header/tabs/Face-Index/Selections/Raw-Transfers are always
                about the host); photoSourceProjects lets its All Photos grid
                merge in every other selected event too, via the in-header
                event dropdown (defaults to all checked). */}
            {selectedProjects[0] && (
              <EventSection
                key={selectedProjects[0].projectId}
                project={selectedProjects[0]}
                onUpdated={fetchProjects}
                selectedIds={photoSelections.get(selectedProjects[0].projectId) ?? new Set()}
                onSelectionChange={handleSelectionChange(selectedProjects[0].projectId)}
                onFilesLoaded={handleFilesLoaded(selectedProjects[0].projectId)}
                refreshTrigger={refreshTriggers.get(selectedProjects[0].projectId) ?? 0}
                hidePill={true}
                triggerShare={shareTargetProjectId === selectedProjects[0].projectId}
                onShareTriggered={() => setShareTargetProjectId(null)}
                zoomLevel={zoomLevel}
                viewMode={gridViewMode}
                onViewModeChange={setGridViewMode}
                onEditProject={setEditProject}
                onQuickShare={setShareModalProjects}
                onAISort={setAiModalProjects}
                onDeleteProject={setDeleteModalProjects}
                onClose={() => { clearSelection(); router.push('/studio/dashboard/overview') }}
                photoSourceProjects={selectedProjects}
                photoSelectionsMap={photoSelections}
                onPhotoSelectionChange={handleSelectionChange}
                onFilesLoadedFor={handleFilesLoaded}
              />
            )}
          </div>

          {/* Shared floating zoom bar — one control for every open event's
              grid, rendered once here so it never stacks per-event. */}
          {gridViewMode === 'grid' && (
            <div className="fixed right-3 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-1 bg-card border border-border/60 rounded-full py-1.5 px-1 shadow-lg">
              <button onClick={() => setZoomLevel(v => Math.max(2, v - 1))} title="Fewer columns (zoom in)"
                className="w-6 h-6 flex-shrink-0 flex items-center justify-center text-muted hover:text-accent transition-colors text-sm font-bold leading-none">
                +
              </button>
              <div ref={zoomTrackRef} onMouseDown={handleZoomTrackDrag} onTouchStart={handleZoomTrackDrag}
                className="relative w-1.5 h-28 flex-shrink-0 bg-border/50 rounded-full cursor-pointer touch-none">
                <span
                  className="absolute left-1/2 w-3.5 h-3.5 rounded-full bg-accent shadow-sm cursor-grab active:cursor-grabbing"
                  style={{ top: `${((zoomLevel - 2) / 8) * 100}%`, transform: 'translate(-50%, -50%)' }}
                />
              </div>
              <button onClick={() => setZoomLevel(v => Math.min(10, v + 1))} title="More columns (zoom out)"
                className="w-6 h-6 flex-shrink-0 flex items-center justify-center text-muted hover:text-accent transition-colors text-sm font-bold leading-none">
                −
              </button>
            </div>
          )}
        </main>
      ) : (
        <main className="flex-1 overflow-auto bg-card">{children}</main>
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

      {topupKind && (
        <StudioTopupModal
          kind={topupKind}
          onClose={() => setTopupKind(null)}
          onSuccess={() => { setTopupKind(null); loadStats() }}
        />
      )}

      {showEditProfile && (
        <EditProfileModal
          initialName={userInfo?.name ?? ''}
          initialPhone={profilePhone}
          onClose={() => setShowEditProfile(false)}
          onSaved={(name) => { setShowEditProfile(false); setUserInfo(u => u ? { ...u, name } : u) }}
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
