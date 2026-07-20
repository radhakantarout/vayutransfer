'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import type { StudioProject, ProjectStatus } from '@/types/studio'
import AddEventModal from '../AddEventModal'
import ChangeClientCoverModal from '@/components/studio/ChangeClientCoverModal'
import PhotoActionsMenu from '@/components/studio/PhotoActionsMenu'

type GridSize = 'small' | 'medium' | 'large'
const GRID_SIZE_COLS: Record<GridSize, string> = {
  small:  'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
  medium: 'grid-cols-1 sm:grid-cols-3 lg:grid-cols-4',
  large:  'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
}

type ProjectWithCover = StudioProject & { coverUrl: string | null; clientCoverUrl: string | null; photoCount: number }

interface ClientGroup {
  clientName: string
  // Real events only (excludes the placeholder "client shell" row, if any) —
  // used for display/counts.
  events: ProjectWithCover[]
  // Every row for this client, including a placeholder — passed to
  // AddEventModal so it can detect and promote the placeholder in place.
  allProjects: ProjectWithCover[]
  // Whichever row currently anchors the client-spanning cover pointer —
  // the oldest row (stable across future event additions/promotions).
  anchorProjectId: string
  coverUrl: string | null
  totalPhotos: number
  isStarred: boolean
  latestUpdatedAt: string
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
  const router = useRouter()
  const searchParams = useSearchParams()
  const [projects, setProjects]   = useState<ProjectWithCover[]>([])
  const [loading, setLoading]     = useState(true)
  const [view, setView]           = useState<'grid' | 'list'>('grid')
  const [gridSize, setGridSize]   = useState<GridSize>('small')
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | ProjectStatus>('ALL')
  const [dateFilter, setDateFilter]     = useState<DateFilter>('ALL')
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>('ALL')
  const [starredOnly, setStarredOnly]   = useState(false)
  // Newest-10 view, reached from the sidebar's "Recent" tab — see ?filter=
  // below. Applied as a post-filter slice, same pipeline as everything else.
  const [recentOnly, setRecentOnly]     = useState(false)
  const [addEventClient, setAddEventClient] = useState<string | null>(null)
  const [coverPickerClient, setCoverPickerClient] = useState<string | null>(null)

  const loadProjects = () => {
    fetch('/studio/api/admin/projects/with-covers').then(r => r.json()).then(res => {
      if (res.success) setProjects(res.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { loadProjects() }, [])

  // Sidebar Recent/Starred tabs land here with ?filter=recent|starred instead
  // of rendering their own list in the sidebar — same card page, just
  // pre-filtered. Depends on searchParams (not just mount): navigating here
  // from Recent to Starred (or back) is a same-route query-string-only
  // transition, so the component never remounts — an empty dep array would
  // only apply the filter on first load and silently miss every click after
  // that until a hard refresh forced a fresh mount.
  useEffect(() => {
    const filter = searchParams.get('filter')
    setRecentOnly(filter === 'recent')
    setStarredOnly(filter === 'starred')
  }, [searchParams])

  // A client card represents every event for that client, so starring it
  // stars/unstars all of them together — matches how the card's own
  // isStarred badge already collapses `events.some(e => e.isStarred)` down
  // to one boolean. Instant local update, PATCHes fire in the background
  // (same pattern as the dashboard sidebar's own star-all pill).
  const toggleClientStar = (g: ClientGroup, e?: React.MouseEvent) => {
    e?.preventDefault(); e?.stopPropagation()
    const next = !g.isStarred
    const ids = new Set(g.events.map(ev => ev.projectId))
    setProjects(prev => prev.map(p => ids.has(p.projectId) ? { ...p, isStarred: next } : p))
    g.events.forEach(ev => {
      fetch(`/studio/api/admin/projects/${ev.projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isStarred: next }),
      }).catch(() => {})
    })
  }

  const clearActiveFilter = () => {
    setRecentOnly(false)
    setStarredOnly(false)
    router.replace('/studio/dashboard/projects')
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const now = Date.now()
    const base = projects.filter(p => {
      if (q) {
        const haystack = `${p.clientName} ${p.eventType} ${p.eventLocation ?? ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      if (starredOnly && !p.isStarred) return false
      // A placeholder has no real status/date/link yet — it always passes
      // the event-specific filters below so its client card can still show
      // up as "no events yet" rather than vanishing under any filter.
      if (p.isPlaceholder) return true
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false
      if (dateFilter === 'UPCOMING' && new Date(p.eventDate).getTime() < now) return false
      if (dateFilter === 'PAST' && new Date(p.eventDate).getTime() >= now) return false
      if (expiryFilter !== 'ALL' && expiryState(p) !== expiryFilter) return false
      return true
    })
    if (!recentOnly) return base
    // Newest-10 by creation date. Placeholders (a client created but with
    // no event added yet) are included — that's exactly what a brand-new
    // project looks like right after creation, and it should show up here
    // immediately, same as it already does in the unfiltered "My Projects"
    // view.
    return [...base]
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .slice(0, 10)
  }, [projects, search, statusFilter, dateFilter, expiryFilter, starredOnly, recentOnly])

  // One project (client) can have multiple events — group here so the
  // overview shows a single card per client, not one per event.
  const clientGroups = useMemo<ClientGroup[]>(() => {
    const map = new Map<string, ProjectWithCover[]>()
    for (const p of filtered) {
      const key = p.clientName || 'Unknown'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return Array.from(map.entries())
      .map(([clientName, allProjects]) => {
        const events = allProjects.filter(p => !p.isPlaceholder)
        const sorted = [...events].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
        const anchor = [...allProjects].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))[0]
        return {
          clientName,
          events: sorted,
          allProjects,
          anchorProjectId: anchor.projectId,
          coverUrl: allProjects.find(e => e.clientCoverUrl)?.clientCoverUrl ?? sorted.find(e => e.coverUrl)?.coverUrl ?? null,
          totalPhotos: events.reduce((s, e) => s + e.photoCount, 0),
          isStarred: events.some(e => e.isStarred),
          latestUpdatedAt: (sorted[0] ?? allProjects[0])?.updatedAt ?? '',
        }
      })
      .sort((a, b) => b.latestUpdatedAt.localeCompare(a.latestUpdatedAt))
  }, [filtered])

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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-text-primary">
              {recentOnly ? 'Recent Projects' : starredOnly ? 'Starred Projects' : 'My Projects'}
            </h1>
            {(recentOnly || starredOnly) && (
              <button onClick={clearActiveFilter}
                className="flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-text-primary bg-border/50 hover:bg-border/70 rounded-full px-2.5 py-1 transition-colors">
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear filter
              </button>
            )}
          </div>
          <p className="text-sm text-muted mt-0.5">{clientGroups.length} of {new Set(projects.map(p => p.clientName)).size} project{new Set(projects.map(p => p.clientName)).size !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative w-64 flex-shrink-0">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search projects…"
              title="Search projects by client, event type, location"
              className="w-full bg-card border border-border rounded-xl pl-9 pr-8 py-2 text-sm text-text-primary placeholder:text-muted/60 focus:outline-none focus:border-accent/60 transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')} title="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-muted hover:text-text-primary hover:bg-border/60 transition-colors">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <Link href="/studio/dashboard/projects/new"
            className="bg-accent text-bg text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-accent/90 transition-colors flex-shrink-0">
            + New Project
          </Link>
        </div>
      </div>

      {/* Filters + view toggle — one row */}
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
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex-shrink-0 ${
            starredOnly ? 'bg-yellow-400/15 border-yellow-400/40 text-yellow-400' : 'bg-card border-border text-muted hover:text-text-primary'
          }`}>
          <StarIcon filled={starredOnly} />
          Starred
        </button>

        {/* View toggle — small icon-only, pushed to the row's end */}
        <div className="flex items-center gap-1 ml-auto flex-shrink-0">
          <PhotoActionsMenu
            align="right"
            trigger={
              <span title="Grid view — click for size options"
                className={`w-7 h-7 flex items-center justify-center rounded-lg border cursor-pointer transition-colors ${view === 'grid' ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border text-muted hover:text-text-primary'}`}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </span>
            }
            actions={(['small', 'medium', 'large'] as GridSize[]).map(size => ({
              label: (view === 'grid' && gridSize === size ? '✓ ' : '') + size[0].toUpperCase() + size.slice(1),
              icon: (
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              ),
              onClick: () => { setView('grid'); setGridSize(size) },
            }))}
          />
          <button onClick={() => setView('list')} title="List view"
            className={`w-7 h-7 flex items-center justify-center rounded-lg border transition-colors ${view === 'list' ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border text-muted hover:text-text-primary'}`}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
            </svg>
          </button>
        </div>
      </div>

      {/* Empty state */}
      {clientGroups.length === 0 && (
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
      {clientGroups.length > 0 && view === 'grid' && (
        <div className={`grid ${GRID_SIZE_COLS[gridSize]} gap-4`}>
          {clientGroups.map(g => (
            <Link key={g.clientName} href={`/studio/dashboard/overview?clientSelect=${encodeURIComponent(g.clientName)}`}
              className="group bg-card border border-border rounded-2xl overflow-hidden hover:border-accent/40 transition-colors">
              <div className="relative aspect-video bg-border/40">
                {g.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.coverUrl} alt={g.clientName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted text-3xl">📷</div>
                )}
                {g.events.length > 0 && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCoverPickerClient(g.clientName) }}
                    className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 opacity-0 group-hover:opacity-100 transition-all text-white text-xs font-bold"
                  >
                    {g.coverUrl ? 'Change cover' : 'Set cover'}
                  </button>
                )}
                {/* Rendered after the cover-picker overlay so it stacks on
                    top and stays clickable in that same corner. */}
                {g.events.length > 0 && (
                  <button
                    onClick={(e) => toggleClientStar(g, e)}
                    title={g.isStarred ? 'Unstar' : 'Star'}
                    className={`absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full backdrop-blur-sm transition-colors ${
                      g.isStarred
                        ? 'bg-yellow-400/90 text-bg'
                        : 'bg-black/30 text-white/70 opacity-0 group-hover:opacity-100 hover:text-yellow-300'
                    }`}
                  >
                    <StarIcon filled={g.isStarred} />
                  </button>
                )}
              </div>
              <div className="p-4 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-text-primary truncate">{g.clientName}</span>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${g.events.length === 0 ? 'bg-border/60 text-muted' : 'bg-accent/15 text-accent'}`}>
                    {g.events.length === 0 ? 'No events yet' : `${g.events.length} event${g.events.length !== 1 ? 's' : ''}`}
                  </span>
                </div>
                {g.events.length > 0 ? (
                  <>
                    <div className="text-xs text-muted">{fmtDate(g.events[0].eventDate)}</div>
                    <div className="text-xs text-muted">{g.totalPhotos} photo{g.totalPhotos !== 1 ? 's' : ''}</div>
                  </>
                ) : (
                  <div className="text-xs text-muted">Click to create your first event</div>
                )}
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAddEventClient(g.clientName) }}
                  className="text-xs font-semibold text-accent hover:text-accent/80 transition-colors pt-0.5"
                >
                  {g.events.length === 0 ? '+ Add first event' : '+ Add more events'}
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* List view */}
      {clientGroups.length > 0 && view === 'list' && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
          {clientGroups.map(g => (
            <Link key={g.clientName} href={`/studio/dashboard/overview?clientSelect=${encodeURIComponent(g.clientName)}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-border/20 transition-colors">
              <div className="w-12 h-12 rounded-lg bg-border/40 flex-shrink-0 overflow-hidden flex items-center justify-center">
                {g.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.coverUrl} alt={g.clientName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-muted text-lg">📷</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {g.events.length > 0 && (
                    <button
                      onClick={(e) => toggleClientStar(g, e)}
                      title={g.isStarred ? 'Unstar' : 'Star'}
                      className={`flex-shrink-0 transition-colors ${g.isStarred ? 'text-yellow-400' : 'text-muted/50 hover:text-yellow-400'}`}
                    >
                      <StarIcon filled={g.isStarred} />
                    </button>
                  )}
                  <span className="text-sm font-semibold text-text-primary truncate">{g.clientName}</span>
                </div>
                <div className="text-xs text-muted">
                  {g.events.length > 0
                    ? `${fmtDate(g.events[0].eventDate)} · ${g.totalPhotos} photo${g.totalPhotos !== 1 ? 's' : ''}`
                    : 'Click to create your first event'}
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${g.events.length === 0 ? 'bg-border/60 text-muted' : 'bg-accent/15 text-accent'}`}>
                {g.events.length === 0 ? 'No events yet' : `${g.events.length} event${g.events.length !== 1 ? 's' : ''}`}
              </span>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAddEventClient(g.clientName) }}
                className="text-xs font-semibold text-accent hover:text-accent/80 transition-colors flex-shrink-0"
              >
                {g.events.length === 0 ? '+ Add first event' : '+ Add event'}
              </button>
            </Link>
          ))}
        </div>
      )}

      {addEventClient && (
        <AddEventModal
          clientName={addEventClient}
          existingProjects={clientGroups.find(g => g.clientName === addEventClient)?.allProjects ?? []}
          onClose={() => setAddEventClient(null)}
          onCreated={() => { setAddEventClient(null); loadProjects() }}
        />
      )}

      {coverPickerClient && (() => {
        const g = clientGroups.find(g => g.clientName === coverPickerClient)
        return g ? (
          <ChangeClientCoverModal
            clientName={g.clientName}
            events={g.events}
            anchorProjectId={g.anchorProjectId}
            onClose={() => setCoverPickerClient(null)}
            onSaved={() => { setCoverPickerClient(null); loadProjects() }}
          />
        ) : null
      })()}
    </div>
  )
}
