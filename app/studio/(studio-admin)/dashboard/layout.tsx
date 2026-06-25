'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { StudioProject } from '@/types/studio'

const STATUS_DOT: Record<string, string> = {
  DRAFT:              'bg-muted',
  ACTIVE:             'bg-accent',
  SELECTION_RECEIVED: 'bg-yellow-400',
  COMPLETED:          'bg-success',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function ClientBranch({ clientName, projects }: { clientName: string; projects: StudioProject[] }) {
  const [open, setOpen] = useState(false)
  const pathname        = usePathname()
  const newEventHref    = `/studio/dashboard/projects/new?client=${encodeURIComponent(clientName)}`

  return (
    <div className="group/branch">
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-border/50 transition-colors">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
        >
          <svg
            className={`w-3 h-3 text-muted flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-semibold text-text-primary truncate flex-1">{clientName}</span>
        </button>
        <span className="text-[10px] text-muted flex-shrink-0">{projects.length}</span>
        <Link
          href={newEventHref}
          title={`Add event for ${clientName}`}
          onClick={(e) => e.stopPropagation()}
          className="opacity-0 group-hover/branch:opacity-100 flex-shrink-0 w-4 h-4 flex items-center justify-center rounded text-muted hover:text-accent hover:bg-accent/10 transition-all"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
        </Link>
      </div>

      {open && (
        <div className="ml-3 pl-2.5 border-l border-border/50 space-y-px mt-px">
          {projects.map((p) => {
            const active = pathname === `/studio/dashboard/projects/${p.projectId}`
            return (
              <Link
                key={p.projectId}
                href={`/studio/dashboard/projects/${p.projectId}`}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                  active ? 'bg-accent/15 text-accent' : 'hover:bg-border/50 text-muted hover:text-text-primary'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[p.status] ?? 'bg-muted'}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs truncate leading-tight">
                    {p.eventType.replace(/_/g, ' ')}
                  </div>
                  <div className="text-[10px] text-muted leading-tight">{fmtDate(p.eventDate)}</div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

const SIDEBAR_KEY = 'studio_sidebar_open'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [projects, setProjects] = useState<StudioProject[]>([])
  const [treeOpen, setTreeOpen] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Restore sidebar state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_KEY)
    if (saved === 'false') setSidebarOpen(false)
  }, [])

  const toggleSidebar = () => {
    setSidebarOpen((v) => {
      localStorage.setItem(SIDEBAR_KEY, String(!v))
      return !v
    })
  }

  useEffect(() => {
    fetch('/studio/api/admin/projects')
      .then((r) => r.json())
      .then((d) => { if (d.success) setProjects(d.data) })
      .catch(() => {})
  }, [pathname])

  const clientGroups = (() => {
    const map = new Map<string, StudioProject[]>()
    for (const p of projects) {
      const key = p.clientName || 'Unknown'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return Array.from(map.entries()).sort((a, b) => {
      const la = Math.max(...a[1].map((p) => new Date(p.updatedAt).getTime()))
      const lb = Math.max(...b[1].map((p) => new Date(p.updatedAt).getTime()))
      return lb - la
    })
  })()

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── Sidebar ────────────────────────────────────────────── */}
      <aside
        className={`bg-card border-r border-border flex-shrink-0 flex flex-col overflow-hidden
          transition-all duration-200 ease-in-out
          ${sidebarOpen ? 'w-56' : 'w-0'}`}
      >
        {/* Top nav links */}
        <nav className="px-2 pt-3 pb-2 space-y-0.5 border-b border-border">
          <Link
            href="/studio/dashboard"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname === '/studio/dashboard'
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
          </Link>
        </nav>

        {/* Explorer section */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center px-3 py-2 group/header">
            <button
              onClick={() => setTreeOpen((v) => !v)}
              className="flex items-center gap-1.5 flex-1 min-w-0 hover:opacity-80 transition-opacity"
            >
              <svg
                className={`w-3 h-3 text-muted flex-shrink-0 transition-transform duration-150 ${treeOpen ? 'rotate-90' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-[11px] font-bold text-muted uppercase tracking-widest">
                Projects
              </span>
            </button>
            <span className="text-[10px] text-muted mr-1.5">{projects.length}</span>
            <Link
              href="/studio/dashboard/projects/new"
              title="New project"
              className="opacity-0 group-hover/header:opacity-100 w-4 h-4 flex items-center justify-center rounded text-muted hover:text-accent hover:bg-accent/10 transition-all flex-shrink-0"
            >
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
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* New project — icon only */}
        <div className="p-2 border-t border-border flex justify-center">
          <Link
            href="/studio/dashboard/projects/new"
            title="New project"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted hover:text-accent hover:border-accent/40 hover:bg-accent/10 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
          </Link>
        </div>
      </aside>

      {/* ── Sidebar toggle tab ─────────────────────────────────── */}
      <div className="relative flex-shrink-0">
        <button
          onClick={toggleSidebar}
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          className="absolute top-4 -left-px z-10 flex items-center justify-center
            w-4 h-8 bg-card border border-border rounded-r-md
            text-muted hover:text-text-primary hover:bg-border/60
            transition-colors shadow-sm"
        >
          <svg
            className={`w-3 h-3 transition-transform duration-200 ${sidebarOpen ? '' : 'rotate-180'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* ── Main content ───────────────────────────────────────── */}
      <main className="flex-1 overflow-auto bg-bg">
        {children}
      </main>
    </div>
  )
}
