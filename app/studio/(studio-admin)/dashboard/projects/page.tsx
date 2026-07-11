'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { StudioProject, ProjectStatus } from '@/types/studio'
import PhotoActionsMenu from '@/components/studio/PhotoActionsMenu'
import EditEventModal from '../EditEventModal'

type ProjectWithCover = StudioProject & { coverUrl: string | null; photoCount: number }

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

type DateFilter   = 'ALL' | 'UPCOMING' | 'PAST'
type ExpiryFilter = 'ALL' | 'EXPIRING_SOON' | 'EXPIRED' | 'NO_LINK'

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function expiryState(p: StudioProject): 'EXPIRING_SOON' | 'EXPIRED' | 'NO_LINK' | 'OK' {
  if (!p.clientShareToken || !p.clientShareExpiresAt) return 'NO_LINK'
  const expires = new Date(p.clientShareExpiresAt).getTime()
  const now = Date.now()
  if (expires < now) return 'EXPIRED'
  if (expires - now < 7 * 24 * 60 * 60 * 1000) return 'EXPIRING_SOON'
  return 'OK'
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.5a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.385a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
    </svg>
  )
}

export default function MyProjectsPage() {
  const [projects, setProjects]   = useState<ProjectWithCover[]>([])
  const [loading, setLoading]     = useState(true)
  const [view, setView]           = useState<'grid' | 'list'>('grid')
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | ProjectStatus>('ALL')
  const [dateFilter, setDateFilter]     = useState<DateFilter>('ALL')
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>('ALL')
  const [starredOnly, setStarredOnly]   = useState(false)
  const [editProject, setEditProject]   = useState<StudioProject | null>(null)
  const [toast, setToast]               = useState('')

  const loadProjects = () => {
    fetch('/studio/api/admin/projects/with-covers').then(r => r.json()).then(res => {
      if (res.success) setProjects(res.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { loadProjects() }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const now = Date.now()
    return projects.filter(p => {
      if (q) {
        const haystack = `${p.clientName} ${p.eventType} ${p.eventLocation ?? ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false
      if (dateFilter === 'UPCOMING' && new Date(p.eventDate).getTime() < now) return false
      if (dateFilter === 'PAST' && new Date(p.eventDate).getTime() >= now) return false
      if (expiryFilter !== 'ALL' && expiryState(p) !== expiryFilter) return false
      if (starredOnly && !p.isStarred) return false
      return true
    })
  }, [projects, search, statusFilter, dateFilter, expiryFilter, starredOnly])

  const toggleStar = async (p: ProjectWithCover) => {
    const next = !p.isStarred
    setProjects(prev => prev.map(x => x.projectId === p.projectId ? { ...x, isStarred: next } : x))
    await fetch(`/studio/api/admin/projects/${p.projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isStarred: next }),
    })
  }

  const quickCopyLink = async (p: ProjectWithCover) => {
    if (p.clientShareToken && expiryState(p) !== 'EXPIRED' && expiryState(p) !== 'NO_LINK') {
      const url = `${window.location.origin}/studio/gallery/${p.clientShareToken}`
      await navigator.clipboard.writeText(url)
      setToast('Link copied to clipboard')
    } else {
      setToast('No active share link yet — open the project to generate one')
    }
  }

  const deleteProject = async (p: ProjectWithCover) => {
    if (!confirm(`Delete "${p.clientName}"? This permanently deletes all photos and cannot be undone.`)) return
    setProjects(prev => prev.filter(x => x.projectId !== p.projectId))
    await fetch(`/studio/api/admin/projects/${p.projectId}`, { method: 'DELETE' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-text-primary">My Projects</h1>
          <p className="text-sm text-muted mt-0.5">{filtered.length} of {projects.length} project{projects.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/studio/dashboard/projects/new"
          className="bg-accent text-bg text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-accent/90 transition-colors">
          + New Project
        </Link>
      </div>

      {/* Search + view toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search projects by client, event type, location…"
            className="w-full bg-card border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm text-text-primary placeholder:text-muted/60 focus:outline-none focus:border-accent/60 transition-colors"
          />
        </div>
        <div className="flex items-center bg-card border border-border rounded-xl p-1 flex-shrink-0">
          <button onClick={() => setView('grid')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${view === 'grid' ? 'bg-accent/15 text-accent' : 'text-muted hover:text-text-primary'}`}>
            Grid
          </button>
          <button onClick={() => setView('list')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${view === 'list' ? 'bg-accent/15 text-accent' : 'text-muted hover:text-text-primary'}`}>
            List
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'ALL' | ProjectStatus)}
          className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary outline-none focus:border-accent">
          <option value="ALL">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="ACTIVE">Active</option>
          <option value="SELECTION_RECEIVED">Selection in</option>
          <option value="COMPLETED">Completed</option>
        </select>
        <select value={dateFilter} onChange={e => setDateFilter(e.target.value as DateFilter)}
          className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary outline-none focus:border-accent">
          <option value="ALL">All dates</option>
          <option value="UPCOMING">Upcoming</option>
          <option value="PAST">Past</option>
        </select>
        <select value={expiryFilter} onChange={e => setExpiryFilter(e.target.value as ExpiryFilter)}
          className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary outline-none focus:border-accent">
          <option value="ALL">Any link status</option>
          <option value="EXPIRING_SOON">Expiring soon</option>
          <option value="EXPIRED">Expired</option>
          <option value="NO_LINK">No link yet</option>
        </select>
        <button onClick={() => setStarredOnly(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            starredOnly ? 'bg-yellow-400/15 border-yellow-400/40 text-yellow-400' : 'bg-card border-border text-muted hover:text-text-primary'
          }`}>
          <StarIcon filled={starredOnly} />
          Starred
        </button>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-16 space-y-4">
          <div className="text-5xl">📁</div>
          <div className="text-text-primary font-semibold text-lg">
            {projects.length === 0 ? 'No projects yet' : 'No projects match your filters'}
          </div>
          {projects.length === 0 && (
            <Link href="/studio/dashboard/projects/new"
              className="inline-block bg-accent text-bg text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-accent/90 transition-colors mt-2">
              Create Project
            </Link>
          )}
        </div>
      )}

      {/* Grid view */}
      {filtered.length > 0 && view === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => (
            <Link key={p.projectId} href={`/studio/dashboard/projects/${p.projectId}`}
              className="group bg-card border border-border rounded-2xl overflow-hidden hover:border-accent/40 transition-colors">
              <div className="relative aspect-video bg-border/40">
                {p.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.coverUrl} alt={p.clientName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted text-3xl">📷</div>
                )}
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleStar(p) }}
                  className={`absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full backdrop-blur-sm transition-colors ${
                    p.isStarred ? 'bg-yellow-400/90 text-bg' : 'bg-black/40 text-white hover:bg-black/60'
                  }`}
                >
                  <StarIcon filled={!!p.isStarred} />
                </button>
              </div>
              <div className="p-4 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-text-primary truncate">{p.clientName}</span>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${STATUS_COLOR[p.status] ?? 'bg-border text-muted'}`}>
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </div>
                <div className="text-xs text-muted">{p.eventType.replace(/_/g, ' ')} · {fmtDate(p.eventDate)}</div>
                <div className="text-xs text-muted">{p.photoCount} photo{p.photoCount !== 1 ? 's' : ''}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* List view */}
      {filtered.length > 0 && view === 'list' && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
          {filtered.map(p => (
            <div key={p.projectId} className="relative">
              <Link href={`/studio/dashboard/projects/${p.projectId}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-border/20 transition-colors">
                <div className="w-12 h-12 rounded-lg bg-border/40 flex-shrink-0 overflow-hidden flex items-center justify-center">
                  {p.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.coverUrl} alt={p.clientName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-muted text-lg">📷</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {p.isStarred && <span className="text-yellow-400 flex-shrink-0"><StarIcon filled /></span>}
                    <span className="text-sm font-semibold text-text-primary truncate">{p.clientName}</span>
                  </div>
                  <div className="text-xs text-muted">{p.eventType.replace(/_/g, ' ')} · {fmtDate(p.eventDate)} · {p.photoCount} photo{p.photoCount !== 1 ? 's' : ''}</div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${STATUS_COLOR[p.status] ?? 'bg-border text-muted'}`}>
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
                <div className="w-8 flex-shrink-0" />
              </Link>
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <PhotoActionsMenu
                  align="right"
                  trigger={
                    <button className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-text-primary hover:bg-border/60 transition-colors">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
                    </button>
                  }
                  actions={[
                    {
                      label: 'Edit project',
                      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.5-9.5a2.121 2.121 0 013 3L12 16l-4 1 1-4 9.5-9.5z" /></svg>,
                      onClick: () => setEditProject(p),
                    },
                    {
                      label: 'Quick copy link',
                      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>,
                      onClick: () => quickCopyLink(p),
                    },
                    {
                      label: p.isStarred ? 'Unstar' : 'Star as favorite',
                      icon: <StarIcon filled={!!p.isStarred} />,
                      onClick: () => toggleStar(p),
                    },
                    {
                      label: 'Delete project',
                      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" /></svg>,
                      onClick: () => deleteProject(p),
                      danger: true,
                    },
                  ]}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {editProject && (
        <EditEventModal
          project={editProject}
          onClose={() => setEditProject(null)}
          onSaved={loadProjects}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-text-primary text-bg text-sm font-medium px-4 py-2.5 rounded-xl shadow-2xl z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
