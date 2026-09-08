'use client'

// "My Transfers" — the studio-wide list/monitoring view, matching
// VayuTransfer's own /transfers page (stats + search/filter/sort + list, no
// upload UI of its own). Sending and requesting now live on their own pages
// (RawTransferSend.tsx / RawTransferRequestFlow.tsx) — this component is
// purely for reviewing and managing transfers that already exist.

import { useMemo, useState } from 'react'
import type { StudioTransfer } from '@/types/studio'
import TransferList from './TransferList'
import TransferDetailPanel from './TransferDetailPanel'
import { useRawTransfers } from './useRawTransfers'
import { derivedStatus, fmtBytes, type DerivedStatus } from './transferUtils'

type StatusFilter = 'all' | DerivedStatus
type SortBy = 'newest' | 'oldest' | 'largest'

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl px-4 py-3">
      <div className="text-lg font-bold text-text-primary">{value}</div>
      <div className="text-[11px] text-muted uppercase tracking-wide">{label}</div>
    </div>
  )
}

export default function RawTransferManager() {
  const { transfers, projectsById, loading, loadTransfers, stats } = useRawTransfers()
  const [selected, setSelected] = useState<StudioTransfer | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortBy, setSortBy] = useState<SortBy>('newest')

  const visibleTransfers = useMemo(() => {
    let list = transfers ?? []
    if (statusFilter !== 'all') list = list.filter(t => derivedStatus(t) === statusFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(t => {
        const project = projectsById.get(t.projectId)
        return (t.filename ?? '').toLowerCase().includes(q)
          || (project?.clientName ?? '').toLowerCase().includes(q)
          || (project?.eventType ?? '').toLowerCase().includes(q)
      })
    }
    const sorted = [...list]
    if (sortBy === 'newest') sorted.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    else if (sortBy === 'oldest') sorted.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
    else sorted.sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0))
    return sorted
  }, [transfers, statusFilter, search, sortBy, projectsById])

  const selectedProject = selected ? projectsById.get(selected.projectId) : undefined

  return (
    <div className="flex items-start gap-4">
      <div className="flex-1 min-w-0 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary">My Transfers</h1>
          <p className="text-xs text-muted mt-0.5">Every Raw Transfer across every event, in one place.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Transfers" value={String(stats.total)} />
          <StatCard label="Total Size" value={fmtBytes(stats.totalSize)} />
          <StatCard label="Active" value={String(stats.active)} />
          <StatCard label="Expired" value={String(stats.expired)} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search filename, client, or event…"
            className="flex-1 min-w-[160px] bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
          >
            <option value="all">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="EXTENDED">Extended</option>
            <option value="EXPIRING_SOON">Expiring soon</option>
            <option value="EXPIRED">Expired</option>
            <option value="FAILED">Failed</option>
            <option value="PENDING">Awaiting upload</option>
            <option value="UPLOADING">Uploading</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="largest">Largest first</option>
          </select>
        </div>

        <TransferList
          transfers={visibleTransfers}
          loading={loading}
          projectsById={projectsById}
          emptyMessage={search.trim() || statusFilter !== 'all' ? 'No transfers match your search/filters.' : 'No transfers yet — send or request your first file from Send/Request.'}
          onChanged={loadTransfers}
          onOpenDetail={setSelected}
        />
      </div>

      {selected && selectedProject && (
        <TransferDetailPanel
          transfer={selected}
          project={selectedProject}
          onClose={() => setSelected(null)}
          onChanged={loadTransfers}
        />
      )}
    </div>
  )
}
