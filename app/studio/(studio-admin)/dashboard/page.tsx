'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { StudioProject } from '@/types/studio'

/* ── helpers ─────────────────────────────────────────────────── */

const STATUS_COLOR: Record<string, string> = {
  DRAFT:              'bg-border/60 text-muted',
  ACTIVE:             'bg-accent/15 text-accent',
  SELECTION_RECEIVED: 'bg-yellow-400/15 text-yellow-400',
  COMPLETED:          'bg-success/15 text-success',
}
const STATUS_LABEL: Record<string, string> = {
  DRAFT:              'Draft',
  ACTIVE:             'Active',
  SELECTION_RECEIVED: 'Selection in',
  COMPLETED:          'Completed',
}

function fmtBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ── stat card ───────────────────────────────────────────────── */
function StatCard({
  label, value, sub, accent = false, warn = false,
}: { label: string; value: string | number; sub?: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className={`bg-card border rounded-2xl px-5 py-4 space-y-1 ${
      warn    ? 'border-yellow-400/30' :
      accent  ? 'border-accent/30'    : 'border-border'
    }`}>
      <div className={`text-2xl font-extrabold ${
        warn   ? 'text-yellow-400' :
        accent ? 'text-accent'     : 'text-text-primary'
      }`}>{value}</div>
      <div className="text-xs font-medium text-muted">{label}</div>
      {sub && <div className="text-[11px] text-muted/70">{sub}</div>}
    </div>
  )
}

/* ── project tree node ───────────────────────────────────────── */
function ClientBranch({
  clientName, projects, defaultOpen,
}: { clientName: string; projects: StudioProject[]; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      {/* Client row */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-border/40 transition-colors text-left group"
      >
        <svg
          className={`w-3.5 h-3.5 text-muted flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-sm font-semibold text-text-primary flex-1 truncate">{clientName}</span>
        <span className="text-xs text-muted bg-border/60 rounded-full px-2 py-0.5 flex-shrink-0">
          {projects.length}
        </span>
      </button>

      {/* Events under this client */}
      {open && (
        <div className="ml-5 pl-3 border-l border-border/60 space-y-0.5 mt-0.5 mb-1">
          {projects.map((p) => (
            <Link
              key={p.projectId}
              href={`/studio/dashboard/projects/${p.projectId}`}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-border/40 transition-colors group/item"
            >
              <div className="min-w-0">
                <div className="text-sm text-text-primary truncate">
                  {p.eventType.replace(/_/g, ' ')}
                </div>
                <div className="text-[11px] text-muted">{fmtDate(p.eventDate)}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {p.status === 'SELECTION_RECEIVED' && p.editingRequiredCount > 0 && (
                  <span className="text-[10px] font-semibold text-yellow-400 bg-yellow-400/10 rounded px-1.5 py-0.5">
                    {p.editingRequiredCount} edits
                  </span>
                )}
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[p.status] ?? 'bg-border text-muted'}`}>
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
                <svg className="w-3.5 h-3.5 text-muted opacity-0 group-hover/item:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── main page ───────────────────────────────────────────────── */
export default function DashboardPage() {
  const [projects, setProjects]       = useState<StudioProject[]>([])
  const [studioName, setStudioName]   = useState('')
  const [storageBytes, setStorageBytes] = useState(0)
  const [loading, setLoading]         = useState(true)
  const [treeOpen, setTreeOpen]       = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/studio/api/admin/projects').then((r) => r.json()),
      fetch('/studio/api/admin/stats').then((r) => r.json()),
    ]).then(([pRes, sRes]) => {
      if (pRes.success) setProjects(pRes.data)
      if (sRes.success) {
        setStudioName(sRes.data.studioName)
        setStorageBytes(sRes.data.storageUsedBytes ?? 0)
      }
    }).finally(() => setLoading(false))
  }, [])

  /* ── derived analytics ─────────────────────────────────────── */
  const total      = projects.length
  const active     = projects.filter((p) => p.status === 'ACTIVE').length
  const selections = projects.filter((p) => p.status === 'SELECTION_RECEIVED').length
  const completed  = projects.filter((p) => p.status === 'COMPLETED').length
  const totalPhotos = projects.reduce((s, p) => s + (p.totalFiles ?? 0), 0)
  const needEdits  = projects.reduce((s, p) => s + (p.editingRequiredCount ?? 0), 0)

  /* ── group projects by clientName ──────────────────────────── */
  const clientMap = new Map<string, StudioProject[]>()
  for (const p of projects) {
    const key = p.clientName || 'Unknown'
    if (!clientMap.has(key)) clientMap.set(key, [])
    clientMap.get(key)!.push(p)
  }
  // sort clients by most-recently-updated project
  const clientGroups = Array.from(clientMap.entries()).sort((a, b) => {
    const latestA = Math.max(...a[1].map((p: StudioProject) => new Date(p.updatedAt).getTime()))
    const latestB = Math.max(...b[1].map((p: StudioProject) => new Date(p.updatedAt).getTime()))
    return latestB - latestA
  })

  /* ── recent activity (last 4 updated) ─────────────────────── */
  const recent = [...projects]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-text-primary">
            {studioName ? studioName : 'Dashboard'}
          </h1>
          <p className="text-sm text-muted mt-0.5">Studio overview</p>
        </div>
        <Link
          href="/studio/dashboard/projects/new"
          className="bg-accent text-bg text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-accent/90 transition-colors"
        >
          + New Project
        </Link>
      </div>

      {/* ── Analytics grid ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard label="Total Projects"      value={total}              />
        <StatCard label="Active"              value={active}   accent    />
        <StatCard label="Selections In"       value={selections} warn={selections > 0} sub={selections > 0 ? 'Awaiting your action' : undefined} />
        <StatCard label="Completed"           value={completed}          />
        <StatCard label="Photos Uploaded"     value={totalPhotos}        />
        <StatCard label="Need Edits"          value={needEdits} warn={needEdits > 0}   />
        <StatCard label="Storage Used"        value={fmtBytes(storageBytes)} sub="across all projects" />
        <StatCard label="Clients"             value={clientMap.size}     />
      </div>

      {/* ── Recent activity ────────────────────────────────────── */}
      {recent.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Recent activity</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {recent.map((p) => (
              <Link
                key={p.projectId}
                href={`/studio/dashboard/projects/${p.projectId}`}
                className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 hover:border-accent/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-text-primary truncate">{p.clientName}</div>
                  <div className="text-xs text-muted">{p.eventType.replace(/_/g, ' ')} · {fmtDate(p.eventDate)}</div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${STATUS_COLOR[p.status] ?? 'bg-border text-muted'}`}>
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Projects tree panel ─────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {/* Panel header */}
        <button
          onClick={() => setTreeOpen((v) => !v)}
          className="w-full flex items-center gap-3 px-5 py-4 hover:bg-border/30 transition-colors border-b border-border"
        >
          <svg
            className={`w-4 h-4 text-muted flex-shrink-0 transition-transform duration-200 ${treeOpen ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-bold text-text-primary flex-1 text-left">All Projects</span>
          <span className="text-xs text-muted bg-border/60 rounded-full px-2.5 py-0.5">{total}</span>
        </button>

        {/* Tree body */}
        {treeOpen && (
          <div className="px-3 py-2">
            {clientGroups.length === 0 ? (
              <div className="text-center py-10 space-y-3">
                <div className="text-4xl">📷</div>
                <div className="text-sm font-semibold text-text-primary">No projects yet</div>
                <Link
                  href="/studio/dashboard/projects/new"
                  className="inline-block text-xs text-accent hover:underline"
                >
                  Create your first project →
                </Link>
              </div>
            ) : (
              <div className="space-y-0.5">
                {clientGroups.map(([clientName, clientProjects], idx) => (
                  <ClientBranch
                    key={clientName}
                    clientName={clientName}
                    projects={clientProjects}
                    defaultOpen={idx === 0}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
