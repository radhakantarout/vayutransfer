'use client'

// Raw Transfer's "Activity" page — mirrors the shape of VayuTransfer's own
// account-level Activity feed (stat cards + a chronological event list),
// but built entirely from data already on hand (the studio-wide transfers
// list) rather than a dedicated per-download audit table. VayuTransfer logs
// individual download attempts (success/failure/country) to its own audit
// table; VayuStudios' raw transfers only keep an aggregate downloadCount/
// lastDownloadedAt per transfer, so this feed is coarser by necessity — one
// entry per meaningful state change, not one per download attempt. Real
// per-download-attempt logging would need new backend work; not part of
// this pass.

import { useMemo } from 'react'
import type { StudioProject, StudioTransfer } from '@/types/studio'
import { useRawTransfers } from './useRawTransfers'
import { derivedStatus, fmtBytes, fmtExact, fmtRelative } from './transferUtils'

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl px-4 py-3">
      <div className="text-lg font-bold text-text-primary">{value}</div>
      <div className="text-[11px] text-muted uppercase tracking-wide">{label}</div>
    </div>
  )
}

type EventTone = 'neutral' | 'success' | 'warning' | 'danger'
interface ActivityEntry {
  id: string
  timestamp: string
  label: string
  tone: EventTone
}

const TONE_DOT: Record<EventTone, string> = {
  neutral: 'bg-muted',
  success: 'bg-success',
  warning: 'bg-yellow-500',
  danger:  'bg-danger',
}

function eventLabel(project: StudioProject | undefined): string {
  if (!project) return 'a deleted event'
  return `${project.clientName} · ${(project.eventType ?? '').replace(/_/g, ' ')}`
}

function buildActivity(transfers: StudioTransfer[], projectsById: Map<string, StudioProject>): ActivityEntry[] {
  const entries: ActivityEntry[] = []
  for (const t of transfers) {
    const project = projectsById.get(t.projectId)
    const who = eventLabel(project)
    const file = t.fileCount ? `${t.fileCount} files` : t.filename ?? 'a file'

    entries.push({
      id: `${t.transferId}-created`,
      timestamp: t.createdAt,
      label: t.direction === 'SEND' ? `Sent to ${who}` : `Requested from ${who}`,
      tone: 'neutral',
    })

    if (t.lastDownloadedAt) {
      entries.push({
        id: `${t.transferId}-downloaded`,
        timestamp: t.lastDownloadedAt,
        label: `Downloaded ${t.downloadCount}× — ${file}`,
        tone: 'success',
      })
    }

    if (t.importedToGallery) {
      entries.push({
        id: `${t.transferId}-imported`,
        // No dedicated "imported at" timestamp on the record — updatedAt is
        // the closest available proxy (nothing else touches the row after
        // import besides the import itself).
        timestamp: t.updatedAt,
        label: `Imported to gallery — ${file}`,
        tone: 'success',
      })
    }

    if (derivedStatus(t) === 'EXPIRED') {
      entries.push({
        id: `${t.transferId}-expired`,
        timestamp: t.shareExpiresAt,
        label: `Link expired — ${file}`,
        tone: 'warning',
      })
    }
  }
  return entries.sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''))
}

export default function RawTransferActivity() {
  const { transfers, projectsById, loading, stats } = useRawTransfers()

  const activity = useMemo(() => buildActivity(transfers ?? [], projectsById), [transfers, projectsById])

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Activity</h1>
        <p className="text-xs text-muted mt-0.5">Your Raw Transfer history, across every event.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Transfers" value={String(stats.total)} />
        <StatCard label="Total Size" value={fmtBytes(stats.totalSize)} />
        <StatCard label="Active" value={String(stats.active)} />
        <StatCard label="Expired" value={String(stats.expired)} />
      </div>

      {loading && activity.length === 0 ? (
        <div className="flex justify-center py-14">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activity.length === 0 ? (
        <div className="border border-dashed border-border rounded-2xl p-10 text-center space-y-2">
          <div className="text-3xl">📋</div>
          <p className="text-sm text-muted">No activity yet — send or request your first file to see it here.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {activity.map(entry => (
            <div key={entry.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TONE_DOT[entry.tone]}`} />
              <span className="flex-1 min-w-0 text-sm text-text-primary truncate">{entry.label}</span>
              <span className="text-[11px] text-muted flex-shrink-0" title={fmtExact(entry.timestamp)}>{fmtRelative(entry.timestamp)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
