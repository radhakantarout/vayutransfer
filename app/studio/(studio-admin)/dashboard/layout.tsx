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

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-border/50 transition-colors text-left group"
      >
        <svg
          className={`w-3 h-3 text-muted flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-xs font-semibold text-text-primary truncate flex-1">{clientName}</span>
        <span className="text-[10px] text-muted flex-shrink-0">{projects.length}</span>
      </button>

      {open && (
        <div className="ml-3 pl-2.5 border-l border-border/50 space-y-px mt-px">
          {projects.map((p) => {
            const active = pathname === `/studio/dashboard/projects/${p.projectId}`
            return (
              <Link
                key={p.projectId}
                href={`/studio/dashboard/projects/${p.projectId}`}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors group/item ${
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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [projects, setProjects]     = useState<StudioProject[]>([])
  const [treeOpen, setTreeOpen]     = useState(true)

  useEffect(() => {
    fetch('/studio/api/admin/projects')
      .then((r) => r.json())
      .then((d) => { if (d.success) setProjects(d.data) })
      .catch(() => {})
  }, [pathname]) // refetch when navigating (new project created etc.)

  // group by clientName, sorted by most recent
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
      <aside className="w-56 bg-card border-r border-border flex-shrink-0 flex flex-col overflow-hidden">

        {/* Top nav links */}
        <nav className="px-2 pt-3 pb-2 space-y-0.5 border-b border-border">
          {[
            { href: '/studio/dashboard', label: 'Dashboard', icon: '⬡' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === item.href
                  ? 'bg-accent/10 text-accent'
                  : 'text-muted hover:text-text-primary hover:bg-border/50'
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Explorer section */}
        <div className="flex-1 overflow-y-auto">
          {/* Section header — click to collapse like VS Code */}
          <button
            onClick={() => setTreeOpen((v) => !v)}
            className="w-full flex items-center gap-1.5 px-3 py-2 hover:bg-border/30 transition-colors"
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
            <span className="text-[10px] text-muted ml-auto">{projects.length}</span>
          </button>

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

        {/* New project button pinned at bottom */}
        <div className="p-2 border-t border-border">
          <Link
            href="/studio/dashboard/projects/new"
            className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-xs font-bold bg-accent text-bg hover:bg-accent/90 transition-colors"
          >
            <span className="text-sm leading-none">+</span>
            New Project
          </Link>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────────── */}
      <main className="flex-1 overflow-auto bg-bg">
        {children}
      </main>
    </div>
  )
}
