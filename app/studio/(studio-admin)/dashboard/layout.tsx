'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { StudioProject } from '@/types/studio'
import AddEventModal from './AddEventModal'
import EditEventModal from './EditEventModal'
import EventSection from './EventSection'

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

function ClientBranch({
  clientName, projects, selectedIds, onToggle, onAddEvent, onEditEvent,
}: {
  clientName: string
  projects: StudioProject[]
  selectedIds: string[]
  onToggle: (id: string) => void
  onAddEvent: (name: string) => void
  onEditEvent: (p: StudioProject) => void
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
          className="opacity-0 group-hover/branch:opacity-100 w-4 h-4 flex items-center justify-center rounded text-muted hover:text-accent hover:bg-accent/10 transition-all flex-shrink-0">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
        </button>
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

                {/* File count badge */}
                {p.totalFiles > 0 && (
                  <span className="text-[9px] text-muted bg-border/60 rounded px-1 py-0.5 flex-shrink-0 leading-tight">
                    {p.totalFiles}
                  </span>
                )}

                {/* Edit icon — on hover */}
                <button
                  onClick={e => { e.stopPropagation(); onEditEvent(p) }}
                  title="Edit event"
                  className="opacity-0 group-hover/event:opacity-100 w-4 h-4 flex items-center justify-center rounded text-muted hover:text-accent hover:bg-accent/10 transition-all flex-shrink-0"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
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
  const [treeOpen, setTreeOpen]         = useState(true)
  const [sidebarOpen, setSidebarOpen]   = useState(true)
  const [selectedIds, setSelectedIds]   = useState<string[]>([])
  const [modalClient, setModalClient]   = useState<string | null>(null)
  const [editProject, setEditProject]   = useState<StudioProject | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_KEY)
    if (saved === 'false') setSidebarOpen(false)
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

  const toggleSidebar = () => {
    setSidebarOpen(v => { localStorage.setItem(SIDEBAR_KEY, String(!v)); return !v })
  }

  const fetchProjects = () => {
    fetch('/studio/api/admin/projects')
      .then(r => r.json())
      .then(d => { if (d.success) setProjects(d.data) })
      .catch(() => {})
  }

  useEffect(() => { fetchProjects() }, [pathname])

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const clearSelection = () => setSelectedIds([])

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

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside className={`bg-card border-r border-border flex-shrink-0 flex flex-col overflow-hidden transition-all duration-200 ease-in-out ${sidebarOpen ? 'w-56' : 'w-0'}`}>

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
              className="opacity-0 group-hover/header:opacity-100 w-4 h-4 flex items-center justify-center rounded text-muted hover:text-accent hover:bg-accent/10 transition-all flex-shrink-0">
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
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* Bottom — new project icon */}
        <div className="p-2 border-t border-border flex justify-center">
          <Link href="/studio/dashboard/projects/new" title="New project" onClick={clearSelection}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted hover:text-accent hover:border-accent/40 hover:bg-accent/10 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
          </Link>
        </div>
      </aside>

      {/* ── Sidebar toggle tab ───────────────────────────────── */}
      <div className="relative flex-shrink-0">
        <button onClick={toggleSidebar} title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          className="absolute top-4 -left-px z-10 flex items-center justify-center w-4 h-8 bg-card border border-border rounded-r-md text-muted hover:text-text-primary hover:bg-border/60 transition-colors shadow-sm">
          <svg className={`w-3 h-3 transition-transform duration-200 ${sidebarOpen ? '' : 'rotate-180'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* ── Main content ─────────────────────────────────────── */}
      {selectedIds.length > 0 ? (
        <main className="flex-1 overflow-auto bg-bg">
          <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
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
              <button onClick={clearSelection}
                className="text-xs text-muted hover:text-text-primary border border-border px-2.5 py-1 rounded-lg hover:bg-border/40 transition-colors">
                Clear
              </button>
            </div>

            {/* Event sections */}
            {selectedProjects.map(p => (
              <EventSection key={p.projectId} project={p} onUpdated={fetchProjects} />
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
    </div>
  )
}
