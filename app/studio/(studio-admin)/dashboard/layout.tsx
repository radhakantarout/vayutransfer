'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { StudioProject, MediaFile, CurationStatus } from '@/types/studio'
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

const SIDEBAR_COLLAPSED_KEY = 'vayu_studio_sidebar_collapsed'

const STATUS_DOT: Record<string, string> = {
  DRAFT:              'bg-muted',
  ACTIVE:             'bg-accent',
  SELECTION_RECEIVED: 'bg-yellow-400',
  COMPLETED:          'bg-success',
}
// Status is no longer shown in the gallery header (removed as redundant with
// the sidebar) — this tiny label is now the only place it's visible.
const STATUS_LABEL: Record<string, string> = {
  DRAFT:              'Draft',
  ACTIVE:             'Active',
  SELECTION_RECEIVED: 'Selection in',
  COMPLETED:          'Completed',
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
  clientName, projects, coverUrl, selectedIds, onToggle, onAddEvent, onEditEvent,
  onDeleteEvents, onQuickShare, onAISort, onEditClient, onCancelSchedule, onReorder,
  onBulkWatermark, bulkWatermarking, selectedPhotoCount,
}: {
  clientName: string
  projects: StudioProject[]
  coverUrl?: string | null
  selectedIds: string[]
  onToggle: (id: string) => void
  onAddEvent: (name: string) => void
  onEditEvent: (p: StudioProject) => void
  onDeleteEvents: (projects: StudioProject[]) => void
  onQuickShare: (projects: StudioProject[]) => void
  onAISort: (projects: StudioProject[]) => void
  onEditClient: (projects: StudioProject[]) => void
  onCancelSchedule: (p: StudioProject) => void
  onReorder: (orderedProjectIds: string[]) => void
  onBulkWatermark: (watermarkEnabled: boolean) => void
  bulkWatermarking: boolean
  selectedPhotoCount: number
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const sortedByDate = [...projects].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  const dateLabel = sortedByDate[0] ? `${fmtDate(sortedByDate[0].eventDate)}${projects.length > 1 ? ' · +more' : ''}` : null
  // The gallery is only actually "open" (something to watermark) once at
  // least one of this client's events is checked — mirrors the old header
  // button's implicit scope (the currently active EventSection's photos).
  const anyEventOpen = projects.some(p => selectedIds.includes(p.projectId))

  // Once the admin has drag-reordered this client's events, every row gets a
  // sequential eventOrder (see handleReorderEvents) — sort by that when
  // present, otherwise fall back to most-recently-updated first.
  const hasCustomOrder = projects.some(p => p.eventOrder !== undefined)
  const orderedProjects = hasCustomOrder
    ? [...projects].sort((a, b) => (a.eventOrder ?? Number.MAX_SAFE_INTEGER) - (b.eventOrder ?? Number.MAX_SAFE_INTEGER))
    : sortedByDate

  const handleDrop = (dropIndex: number) => {
    if (dragIndex === null || dragIndex === dropIndex) { setDragIndex(null); setDragOverIndex(null); return }
    const reordered = [...orderedProjects]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(dropIndex, 0, moved)
    onReorder(reordered.map(p => p.projectId))
    setDragIndex(null)
    setDragOverIndex(null)
  }

  return (
    <div className="group/branch">
      {/* Project card — cover photo left, name/date right, always shown
          (no collapse toggle) with the events list unconditionally below it */}
      <div className="flex items-center gap-3 p-2.5 rounded-xl border border-border/60 bg-card shadow-md shadow-black/5 mb-2">
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-border/40 flex-shrink-0 flex items-center justify-center">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt={clientName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-muted text-lg">📷</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-text-primary truncate">{clientName}</div>
          <div className="text-[11px] text-muted truncate">{dateLabel ?? 'No events yet'}</div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {projects.length > 0 && (
            <span className="text-[10px] text-muted mr-0.5" title={`${projects.length} event${projects.length !== 1 ? 's' : ''}`}>
              {projects.reduce((s, p) => s + (p.totalFiles ?? 0), 0)}
            </span>
          )}
          {projects.length > 0 && (
            <PhotoActionsMenu
              align="right"
              trigger={
                <button title="Client options" className="w-5 h-5 flex items-center justify-center rounded text-muted hover:text-accent hover:bg-accent/10 transition-all flex-shrink-0">
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
          )}
        </div>
      </div>

      {/* Watermark (moved from the gallery header — one less button up there)
          + Add Event — both plain bold text links in the app's accent color,
          same treatment as "+ Add more events" on the My Projects cards */}
      <div className="flex items-center gap-4 px-1 mb-2">
        {anyEventOpen && (
          <PhotoActionsMenu
            align="left"
            trigger={
              <span className={`flex items-center gap-1 text-[11px] font-bold cursor-pointer transition-colors flex-shrink-0 ${bulkWatermarking ? 'text-accent/50' : 'text-accent hover:text-accent/80'}`}>
                <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {bulkWatermarking ? 'Watermarking…' : 'Watermark'}
              </span>
            }
            actions={[
              { label: selectedPhotoCount > 0 ? `Apply to ${selectedPhotoCount} selected` : 'Apply to all photos',
                icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
                onClick: () => onBulkWatermark(true) },
              { label: selectedPhotoCount > 0 ? `Remove from ${selectedPhotoCount} selected` : 'Remove from all photos',
                icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>,
                onClick: () => onBulkWatermark(false) },
            ]}
          />
        )}
        <button onClick={() => onAddEvent(clientName)}
          className="text-[11px] font-bold text-accent hover:text-accent/80 transition-colors flex-shrink-0">
          {projects.length === 0 ? '+ Add First Event' : '+ Add Event'}
        </button>
      </div>

      {/* Event rows — drag the grip handle to reorder */}
      {projects.length === 0 ? (
        <p className="text-[11px] text-muted px-2 py-1.5">No events yet</p>
      ) : (
        <div className="space-y-px">
          {orderedProjects.map((p, i) => {
            const selected = selectedIds.includes(p.projectId)
            return (
              <div
                key={p.projectId}
                draggable
                onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = 'move' }}
                onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i) }}
                onDragLeave={() => setDragOverIndex(prev => (prev === i ? null : prev))}
                onDrop={(e) => { e.preventDefault(); handleDrop(i) }}
                onDragEnd={() => { setDragIndex(null); setDragOverIndex(null) }}
                onClick={() => onToggle(p.projectId)}
                className={`flex items-center gap-1 px-1.5 py-1.5 rounded-lg cursor-pointer transition-colors group/event
                  ${selected ? 'bg-accent/15' : 'hover:bg-border/50'}
                  ${dragOverIndex === i && dragIndex !== null && dragIndex !== i ? 'ring-2 ring-accent/60' : ''}
                  ${dragIndex === i ? 'opacity-40' : ''}`}
              >
                {/* Drag handle */}
                <span className="w-3 h-3 flex-shrink-0 text-muted/50 group-hover/event:text-muted cursor-grab active:cursor-grabbing" title="Drag to reorder">
                  <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="6" r="1.5" /><circle cx="16" cy="6" r="1.5" /><circle cx="8" cy="12" r="1.5" /><circle cx="16" cy="12" r="1.5" /><circle cx="8" cy="18" r="1.5" /><circle cx="16" cy="18" r="1.5" /></svg>
                </span>

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
                  <div className="text-[10px] text-muted leading-tight">
                    {fmtDate(p.eventDate)} · <span className="text-[8px] uppercase tracking-wide">{STATUS_LABEL[p.status] ?? p.status}</span>
                  </div>
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
  const searchParams = useSearchParams()
  const { setNavCollapsed } = useExpandedGrid()

  const [projects, setProjects]         = useState<StudioProject[]>([])
  const [authChecked, setAuthChecked]   = useState(false)
  const [sidebarView, setSidebarView]   = useState<'dashboard' | 'recent' | 'starred' | 'projects'>('projects')
  const [selectedIds, setSelectedIds]   = useState<string[]>([])
  // Set when arriving via a My Projects card click (?clientSelect=) — narrows
  // the sidebar's Projects tree to just this one client ("drill-down"), and
  // drives the empty-state below when they have zero real events yet.
  const [focusedClient, setFocusedClient] = useState<string | null>(null)
  // Cover photo shown on the focused client's small card header in the
  // sidebar — fetched on demand (not on every project list refresh) since
  // resolving covers means a files lookup per event.
  const [focusedCoverUrl, setFocusedCoverUrl] = useState<string | null>(null)
  const [stats, setStats]               = useState<{ storageUsedBytes: number; storageGrantBytes: number; aiSearchCreditsUsed: number; aiSearchCreditsTotal: number } | null>(null)
  const [topupKind, setTopupKind]       = useState<'storage' | 'ai-search' | null>(null)
  const [userInfo, setUserInfo]         = useState<{ role?: string; name?: string; email?: string } | null>(null)
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [sidebarNotifications, setSidebarNotifications] = useState<NotificationItem[]>([])
  const [showSidebarNotif, setShowSidebarNotif] = useState(false)
  const [notifPos, setNotifPos] = useState<{ top: number; left: number } | null>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const compactNotifRef = useRef<HTMLDivElement>(null)
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
  const [bulkWatermarking, setBulkWatermarking] = useState(false)
  const [bulkAISorting, setBulkAISorting] = useState(false)
  // Dispatched to EventSection so its own `files` state updates instantly
  // (no full reload) when the global pill's star toggle fires — see
  // EventSection's externalCurationUpdate prop.
  const [curationUpdateSignal, setCurationUpdateSignal] = useState<{ fileIds: string[]; curationStatus: CurationStatus | undefined; token: number } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 12000)
    return () => clearTimeout(t)
  }, [toast])
  // Persisted across navigations/reloads for the whole session — read once
  // on mount (not in the initializer, to avoid an SSR/client hydration
  // mismatch) and written back on every change. Cleared on logout so the
  // next login starts expanded again.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  useEffect(() => {
    if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1') setSidebarCollapsed(true)
  }, [])
  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? '1' : '0')
  }, [sidebarCollapsed])
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
      // A direct single-event link (e.g. Recent activity) selects just that
      // one event, not a client drill-down — clear any stale sidebar focus.
      setFocusedClient(null)
      setSelectedIds(prev => prev.includes(match[1]) ? prev : [match[1]])
    } else if (pathname === '/studio/dashboard') {
      setSelectedIds([])
    }
  }, [pathname])

  // Fetch the focused client's cover photo for the sidebar's small project
  // card header — only when drilling into a client, not on every project
  // list refresh (resolving a cover means a files lookup per event).
  useEffect(() => {
    if (!focusedClient) { setFocusedCoverUrl(null); return }
    let cancelled = false
    fetch('/studio/api/admin/projects/with-covers').then(r => r.json()).then(d => {
      if (cancelled || !d.success) return
      const match = (d.data as (StudioProject & { coverUrl: string | null; clientCoverUrl: string | null })[])
        .filter(p => p.clientName === focusedClient)
      const cover = match.find(p => p.clientCoverUrl)?.clientCoverUrl ?? match.find(p => p.coverUrl)?.coverUrl ?? null
      setFocusedCoverUrl(cover)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [focusedClient])

  // "My Projects" client cards navigate here with ?clientSelect=<clientName>
  // so every event belonging to that client gets selected in the sidebar —
  // runs after the effect above (which would otherwise reset selectedIds to
  // [] on this same navigation) so it wins. Clears the param once applied so
  // a later project refetch (new array reference) doesn't re-select after
  // the admin has manually changed the selection.
  useEffect(() => {
    const clientSelect = searchParams.get('clientSelect')
    if (!clientSelect || projects.length === 0) return
    const ids = projects.filter(p => p.clientName === clientSelect && !p.isPlaceholder).map(p => p.projectId)
    setSelectedIds(ids)
    setFocusedClient(clientSelect)
    setSidebarView('projects')
    router.replace('/studio/dashboard/overview')
  }, [searchParams, projects, router])

  // Keep the Dashboard tab's highlight in sync with direct navigation/refresh
  // (e.g. visiting /overview straight from a bookmark) — clicking Recent/
  // Starred/Projects afterwards doesn't change the URL, so it won't re-fire
  // this and fight with those tabs' own highlight. Skipped when arriving via
  // ?clientSelect= — deliberately depends on [pathname] ONLY (not
  // searchParams): useSearchParams() returns a new object identity after the
  // clientSelect effect's router.replace strips the param, which would
  // re-fire this effect and stomp sidebarView back to 'dashboard' a moment
  // after the drill-down set it to 'projects' (the exact bug that happened
  // when searchParams was in this dependency array). With only [pathname],
  // this runs once when arriving at /overview — while clientSelect is still
  // in the URL — and never again, since pathname itself doesn't change when
  // the param is stripped.
  useEffect(() => {
    if (pathname === '/studio/dashboard/overview' && !searchParams.get('clientSelect')) setSidebarView('dashboard')
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    localStorage.removeItem(SIDEBAR_COLLAPSED_KEY)
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

  // Persist a client's drag-reordered event list — writes a sequential
  // eventOrder to every event in the new order (not just the moved one) so
  // once the admin has reordered once, every row has a real order to sort by.
  const handleReorderEvents = (orderedProjectIds: string[]) => {
    setProjects(prev => {
      const orderMap = new Map(orderedProjectIds.map((id, i) => [id, i]))
      return prev.map(p => orderMap.has(p.projectId) ? { ...p, eventOrder: orderMap.get(p.projectId) } : p)
    })
    orderedProjectIds.forEach((id, i) => {
      fetch(`/studio/api/admin/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventOrder: i }),
      }).catch(() => {})
    })
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const clearSelection = () => {
    setSelectedIds([])
    setPhotoSelections(new Map())
    setFocusedClient(null)
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

  // Moved here from EventSection's header — same routes, just triggered from
  // the sidebar's project card now instead of an always-visible toolbar
  // button (one less button cluttering the gallery header). Targets whatever
  // photos are selected in the grid, or every photo across the currently
  // open events when nothing's selected.
  const handleBulkWatermark = async (watermarkEnabled: boolean) => {
    setBulkWatermarking(true)
    if (totalPhotoSelected > 0) {
      await Promise.all(
        Array.from(photoSelections.entries()).map(([pid, ids]) =>
          fetch(`/studio/api/admin/projects/${pid}/watermark`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileIds: Array.from(ids), watermarkEnabled }),
          }).catch(() => {})
        )
      )
    } else {
      await Promise.all(
        selectedProjects.map(p =>
          fetch(`/studio/api/admin/projects/${p.projectId}/watermark`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ watermarkEnabled }),
          }).catch(() => {})
        )
      )
    }
    setBulkWatermarking(false)
    // Watermarking runs async (Lambda) — give it a moment before reloading
    // each affected EventSection's files, same delay as before the move.
    setTimeout(() => {
      setRefreshTriggers(prev => {
        const next = new Map(prev)
        selectedProjects.forEach(p => next.set(p.projectId, (next.get(p.projectId) ?? 0) + 1))
        return next
      })
    }, 3000)
  }

  const bumpRefreshForSelectedProjects = () => {
    setRefreshTriggers(prev => {
      const next = new Map(prev)
      selectedProjects.forEach(p => next.set(p.projectId, (next.get(p.projectId) ?? 0) + 1))
      return next
    })
  }

  // "Select all" dropdown — a master checkbox plus one per currently open
  // event, all togglable independently without closing the menu, so the
  // admin can select everything then deselect just one event's photos.
  const isProjectFullySelected = (projectId: string) => {
    const total = (projectFiles.get(projectId) ?? []).length
    const sel = photoSelections.get(projectId)?.size ?? 0
    return total > 0 && sel === total
  }

  // Global selection pill's star toggle — standard "star-all" UX, same as
  // the single-photo star button: if every selected photo is already
  // starred, clicking clears all of them; otherwise it stars every one
  // that isn't already. Updates the UI instantly (both projectFiles here —
  // so a rapid second click sees the correct state — and each open
  // EventSection's own files via externalCurationUpdate) and fires the
  // backend PATCHes in the background, instead of waiting on them plus a
  // full reload before anything visibly changes.
  const allSelectedStarred = allSelectedPhotos.length > 0 && allSelectedPhotos.every(f => !!f.curationStatus)
  const handleGlobalToggleStar = () => {
    const willStar = !allSelectedStarred
    const nextForUi: CurationStatus | undefined = willStar ? 'STARRED' : undefined
    const nextForApi: CurationStatus | null = willStar ? 'STARRED' : null
    const fileIds = allSelectedPhotos.map(f => f.fileId)
    if (fileIds.length === 0) return

    setProjectFiles(prev => {
      const next = new Map(prev)
      photoSelections.forEach((ids, pid) => {
        const filesForP = next.get(pid)
        if (!filesForP) return
        next.set(pid, filesForP.map(f => ids.has(f.fileId) ? { ...f, curationStatus: nextForUi } : f))
      })
      return next
    })
    setCurationUpdateSignal({ fileIds, curationStatus: nextForUi, token: Date.now() })
    setToast(`${fileIds.length} photo${fileIds.length !== 1 ? 's' : ''} ${willStar ? 'starred' : 'unstarred'}`)

    Promise.all(
      allSelectedPhotos.map(f =>
        fetch(`/studio/api/admin/projects/${f.projectId}/files/${f.fileId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ curationStatus: nextForApi }),
        }).catch(() => {})
      )
    )
  }

  // Same fileIds-scoped face-indexing route the sidebar's per-event "⋯"
  // menu already uses, grouped per-project for a selection spanning
  // multiple merged events.
  const handleGlobalAISort = async () => {
    setBulkAISorting(true)
    await Promise.all(
      Array.from(photoSelections.entries()).map(([pid, ids]) =>
        fetch(`/studio/api/admin/projects/${pid}/faces/index`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileIds: Array.from(ids) }),
        }).catch(() => {})
      )
    )
    setBulkAISorting(false)
  }

  // Sequential with a stagger — opening every selected photo's download tab
  // at once via Promise.all gets most of them blocked by the browser's
  // popup blocker (only the first synchronous window.open per user gesture
  // is reliably allowed).
  const handleGlobalDownload = async () => {
    for (const f of allSelectedPhotos) {
      const res = await fetch(`/studio/api/admin/projects/${f.projectId}/files/${f.fileId}/download`).then(r => r.json()).catch(() => null)
      if (res?.success) window.open(res.data.url, '_blank')
      await new Promise(r => setTimeout(r, 150))
    }
  }

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

  const recentProjects = projects
    .filter(p => !p.isPlaceholder)
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    .slice(0, 10)
  const starredProjects = projects.filter(p => p.isStarred && !p.isPlaceholder)

  const selectedProjects = selectedIds
    .map(id => projects.find(p => p.projectId === id))
    .filter((p): p is StudioProject => !!p)

  const allOpenFullySelected = selectedProjects.length > 0 && selectedProjects.every(p => isProjectFullySelected(p.projectId))
  const toggleSelectAllMaster = () => {
    if (allOpenFullySelected) {
      setPhotoSelections(new Map())
      return
    }
    const next = new Map<string, Set<string>>()
    selectedProjects.forEach(p => {
      const filesForP = projectFiles.get(p.projectId) ?? []
      if (filesForP.length > 0) next.set(p.projectId, new Set(filesForP.map(f => f.fileId)))
    })
    setPhotoSelections(next)
  }
  const toggleProjectFullSelection = (projectId: string) => {
    setPhotoSelections(prev => {
      const next = new Map(prev)
      if (isProjectFullySelected(projectId)) {
        next.delete(projectId)
      } else {
        const filesForP = projectFiles.get(projectId) ?? []
        if (filesForP.length > 0) next.set(projectId, new Set(filesForP.map(f => f.fileId)))
      }
      return next
    })
  }

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
    <div className="flex flex-1 overflow-hidden relative">

      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside style={{ width: sidebarCollapsed ? 48 : 256 }}
        className="dash-bold-text relative flex-shrink-0 bg-gradient-to-b from-card to-card/95 flex flex-col overflow-hidden shadow-[4px_0_24px_-6px_rgba(0,0,0,0.12)] z-10 transition-[width] duration-300 ease-in-out">

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

          <div className="flex items-center gap-2">
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
            {activeProduct === 'gallery' && (
              <Link href="/studio/dashboard/projects/new" onClick={clearSelection}
                className="flex-1 flex items-center justify-center gap-1 text-[11px] font-bold tracking-wide text-white bg-accent rounded-lg py-1 shadow-md shadow-accent/30 hover:shadow-lg hover:shadow-accent/40 hover:-translate-y-0.5 active:translate-y-0 transition-all">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                </svg>
                New Project
              </Link>
            )}
          </div>
        </div>

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
                    className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-bold uppercase tracking-wide py-1.5 rounded-lg transition-colors ${
                      // Once a project card is drilled into, this no longer
                      // reflects "browsing all projects" — don't show the
                      // tab as active so clicking it again reads as a fresh
                      // navigation back to the My Projects grid.
                      sidebarView === view && !(view === 'projects' && focusedClient) ? 'bg-accent/10 text-accent' : 'text-muted hover:text-text-primary hover:bg-border/50'
                    }`}>
                    {view === 'recent' && (
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    {view === 'starred' && (
                      <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill={sidebarView === 'starred' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.5a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.385a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                      </svg>
                    )}
                    {view === 'projects' && (
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                      </svg>
                    )}
                    {view === 'recent' ? 'Recent' : view === 'starred' ? 'Starred' : 'Projects'}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-1.5 pt-2 pb-3 space-y-px flex-1 min-h-0">
              {/* Blank on purpose when the Projects tab is selected but no
                  client is drilled into — the My Projects grid page already
                  covers browsing everyone; the tree only reappears once a
                  project card is clicked (focusedClient set). */}
              {sidebarView === 'projects' && focusedClient && (
                clientGroups.filter(([name]) => name === focusedClient).length === 0 ? (
                  <p className="text-[11px] text-muted px-3 py-2">No projects yet</p>
                ) : (
                  clientGroups.filter(([name]) => name === focusedClient).map(([clientName, clientProjects]) => (
                    <ClientBranch
                      key={clientName}
                      clientName={clientName}
                      coverUrl={focusedCoverUrl}
                      projects={clientProjects.filter(p => !p.isPlaceholder)}
                      selectedIds={selectedIds}
                      onToggle={toggleSelect}
                      onAddEvent={setModalClient}
                      onEditEvent={setEditProject}
                      onDeleteEvents={setDeleteModalProjects}
                      onQuickShare={setShareModalProjects}
                      onAISort={setAiModalProjects}
                      onEditClient={setEditClientModalProjects}
                      onCancelSchedule={handleCancelSchedule}
                      onReorder={handleReorderEvents}
                      onBulkWatermark={handleBulkWatermark}
                      bulkWatermarking={bulkWatermarking}
                      selectedPhotoCount={totalPhotoSelected}
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

        {/* Collapsed rail — same icons/actions as the expanded header, just
            stacked and icon-only. Painted over the (still-mounted, just too
            narrow to read) content above via z-30 so nothing squeezed behind
            it is accidentally clickable. The notification dropdown itself is
            portal-rendered straight to document.body, so it still works
            correctly from this second trigger with no logic duplicated —
            only the trigger button markup is repeated. */}
        {sidebarCollapsed && (
          <div className="absolute inset-0 z-30 bg-gradient-to-b from-card to-card/95 flex flex-col items-center gap-3 pt-4 pb-3 overflow-y-auto vayu-scroll">
            {userInfo && (
              <ProfileMenu
                position="below"
                align="left"
                onEditProfile={openEditProfile}
                onLogout={handleLogout}
                trigger={
                  <div title={userInfo.name ?? 'Profile'}
                    className="w-8 h-8 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[11px] font-bold cursor-pointer uppercase">
                    {userInfo.name?.slice(0, 1) ?? '?'}
                  </div>
                }
              />
            )}
            <div ref={compactNotifRef}>
              <button
                onClick={() => {
                  if (!showSidebarNotif) {
                    const rect = compactNotifRef.current?.getBoundingClientRect()
                    if (rect) setNotifPos({ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 256 - 8) })
                  }
                  setShowSidebarNotif(v => !v)
                }}
                title="Notifications"
                className="relative w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-accent hover:bg-border/50 transition-colors">
                <BellIcon />
                {sidebarNotifications.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[8px] font-bold">
                    {sidebarNotifications.length}
                  </span>
                )}
              </button>
            </div>
            <a href="https://wa.me/918984769522" target="_blank" rel="noopener noreferrer" title="Help & support"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-accent hover:bg-border/50 transition-colors">
              <HelpIcon />
            </a>
            <PhotoActionsMenu
              align="left"
              menuClassName="w-48"
              trigger={
                <span title={PRODUCT_LABEL[activeProduct]}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-border/60 bg-card text-accent shadow-sm hover:shadow-md hover:border-accent/30 cursor-pointer transition-all">
                  <span className="w-3.5 h-3.5">{PRODUCT_ICON[activeProduct]}</span>
                </span>
              }
              actions={[
                { label: 'Client Gallery', icon: <GalleryIcon />, onClick: () => { clearSelection(); setSidebarView('projects'); router.push('/studio/dashboard/projects') } },
                { label: 'My Website', icon: <WebsiteIcon />, onClick: () => { clearSelection(); router.push('/studio/dashboard/website') } },
                { label: 'My Booking', icon: <BookingIcon />, onClick: () => { clearSelection(); router.push('/studio/dashboard/bookings') } },
              ]}
            />

            <div className="w-6 border-t border-border/60 flex-shrink-0" />

            {/* Dashboard / Recent / Starred / Projects — same destinations
                as the expanded tabs, icon-only */}
            <Link href="/studio/dashboard/overview" onClick={() => { clearSelection(); setSidebarView('dashboard') }}
              title="Dashboard"
              className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg transition-colors ${
                sidebarView === 'dashboard' ? 'bg-accent/10 text-accent' : 'text-muted hover:text-text-primary hover:bg-border/50'
              }`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </Link>
            <button onClick={() => setSidebarView('recent')} title="Recent"
              className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg transition-colors ${
                sidebarView === 'recent' ? 'bg-accent/10 text-accent' : 'text-muted hover:text-text-primary hover:bg-border/50'
              }`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <button onClick={() => setSidebarView('starred')} title="Starred"
              className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg transition-colors ${
                sidebarView === 'starred' ? 'bg-accent/10 text-accent' : 'text-muted hover:text-text-primary hover:bg-border/50'
              }`}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={sidebarView === 'starred' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.5a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.385a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
            </button>
            <button onClick={() => { setSidebarView('projects'); clearSelection(); router.push('/studio/dashboard/projects') }} title="Projects"
              className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg transition-colors ${
                sidebarView === 'projects' && !focusedClient ? 'bg-accent/10 text-accent' : 'text-muted hover:text-text-primary hover:bg-border/50'
              }`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
            </button>

            {/* Focused client's events — short 3-letter chips, still
                clickable/multi-selectable, same selectedIds/toggleSelect as
                the expanded event rows */}
            {focusedClient && (() => {
              const events = (clientGroups.find(([name]) => name === focusedClient)?.[1] ?? []).filter(p => !p.isPlaceholder)
              return events.length > 0 ? (
                <>
                  <div className="w-6 border-t border-border/60 flex-shrink-0" />
                  <div className="flex flex-col items-center gap-1.5">
                    {events.map(p => {
                      const selected = selectedIds.includes(p.projectId)
                      return (
                        <button key={p.projectId} onClick={() => toggleSelect(p.projectId)}
                          title={`${(p.eventType ?? '').replace(/_/g, ' ')} — ${fmtDate(p.eventDate)}`}
                          className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-[10px] font-bold uppercase transition-colors ${
                            selected ? 'bg-accent text-white' : 'bg-border/40 text-muted hover:text-text-primary hover:bg-border/70'
                          }`}>
                          {(p.eventType ?? '???').slice(0, 3)}
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : null
            })()}
          </div>
        )}

      </aside>

      {/* Sidebar collapse/expand "roller" tab — sits outside <aside> (not
          clipped by its own overflow-hidden) so it stays visible and slides
          along with the sidebar's width transition, straddling its edge. */}
      <button
        onClick={() => setSidebarCollapsed(v => !v)}
        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        style={{ left: sidebarCollapsed ? 48 : 256, marginLeft: -10 }}
        className="absolute bottom-4 z-20 w-5 h-9 flex items-center justify-center rounded-md bg-accent text-white shadow-lg shadow-accent/30 hover:shadow-xl hover:shadow-accent/40 hover:brightness-110 active:brightness-95 transition-all duration-300 ease-in-out"
      >
        <svg className={`w-3 h-3 transition-transform duration-300 ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

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
                externalCurationUpdate={curationUpdateSignal}
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
      ) : focusedClient ? (
        <main className="flex-1 overflow-auto bg-card">
          <div className="max-w-md mx-auto text-center py-20 px-6 space-y-4">
            <div className="text-5xl">📸</div>
            <div className="text-lg font-bold text-text-primary">No events yet for {focusedClient}</div>
            <p className="text-sm text-muted">Create your first event, then upload photos and set one as the cover.</p>
            <button onClick={() => setModalClient(focusedClient)}
              className="bg-accent text-bg text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-accent/90 transition-colors">
              + Create first event
            </button>
            <div>
              <button onClick={() => setFocusedClient(null)} className="text-xs text-muted hover:text-text-primary transition-colors">
                ← Back to all projects
              </button>
            </div>
          </div>
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

      {/* ── Toast — quick confirmation for instant bulk actions (e.g. the
          star toggle), auto-dismisses after 12s ─────────────────── */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-card border border-border rounded-xl shadow-2xl px-4 py-2.5 flex items-center gap-2">
          <svg className="w-4 h-4 text-success flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium text-text-primary">{toast}</span>
          <button onClick={() => setToast(null)} className="text-muted hover:text-text-primary flex-shrink-0 ml-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Global selection pill (all events combined) ──────── */}
      {totalPhotoSelected > 0 && (
        <div className="fixed bottom-5 inset-x-4 z-40 flex justify-center">
          <div className="bg-accent shadow-[0_10px_30px_-6px_rgba(0,0,0,0.45)] rounded-2xl overflow-hidden w-full max-w-md">
            <div className="flex items-center gap-0.5 px-2 py-2">

              {/* × clear */}
              <button onClick={() => setPhotoSelections(new Map())}
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl text-white/85 hover:text-white hover:bg-white/15 transition-colors" aria-label="Clear selection">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Count + select-all dropdown — compact trigger (not a
                  flex-1 button, which used to make the whole gap between
                  it and the star icon clickable) with a spacer after it to
                  push the remaining icons to the right */}
              <PhotoActionsMenu
                align="left"
                direction="up"
                trigger={
                  <span title="Select all" className="flex items-center gap-1 pl-1 pr-2 py-1.5 rounded-xl text-white hover:bg-white/15 transition-colors cursor-pointer">
                    <span className="text-xs font-bold whitespace-nowrap">
                      {totalPhotoSelected} selected{photoSelections.size > 1 ? ` · ${photoSelections.size} events` : ''}
                    </span>
                    <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </span>
                }
                actions={[
                  { label: 'Select all', checked: allOpenFullySelected, onClick: toggleSelectAllMaster },
                  ...(selectedProjects.length > 1 ? selectedProjects.map(p => ({
                    label: (p.eventType ?? '').replace(/_/g, ' '),
                    checked: isProjectFullySelected(p.projectId),
                    onClick: () => toggleProjectFullSelection(p.projectId),
                  })) : []),
                ]}
              />
              <div className="flex-1" />

              {/* ★ Star (bulk toggle) */}
              <button onClick={handleGlobalToggleStar} title={allSelectedStarred ? 'Unstar selected' : 'Star selected'}
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
                  { label: 'Apply Watermark', icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>, onClick: () => handleBulkWatermark(true) },
                  { label: 'Remove Watermark', icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>, onClick: () => handleBulkWatermark(false) },
                ]}
              />

              {/* ✨ AI Sorting/Search (bulk) */}
              <button onClick={handleGlobalAISort} title="Run AI Sorting on selected photos"
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl text-white/85 hover:text-white hover:bg-white/15 transition-colors">
                {bulkAISorting
                  ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.344.344a.75.75 0 01-.53.22H9.75a.75.75 0 01-.53-.22l-.344-.344z" />
                    </svg>}
              </button>

              {/* 📤 Quick Share */}
              <button
                onClick={handleGlobalShare}
                disabled={sharing}
                title="Quick Share selected photos"
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl text-white/85 hover:text-white hover:bg-white/15 transition-colors disabled:opacity-50">
                {sharing
                  ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                    </svg>
                }
              </button>

              {/* ⋯ More — everything else that still makes sense in bulk */}
              <PhotoActionsMenu
                align="right"
                direction="up"
                trigger={
                  <span className="w-8 h-8 flex items-center justify-center rounded-xl text-white/85 hover:text-white hover:bg-white/15 transition-colors cursor-pointer" aria-label="More options">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
                    </svg>
                  </span>
                }
                actions={[
                  { label: 'Preview selected',
                    icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
                    onClick: () => { setGlobalPreviewIdx(0); setShowGlobalPreview(true) } },
                  { label: 'Download selected',
                    icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>,
                    onClick: handleGlobalDownload },
                  { label: 'Delete selected', danger: true,
                    icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>,
                    onClick: () => setShowGlobalDelete(true) },
                ]}
              />

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
