'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { StudioProject } from '@/types/studio'
import StudioTopupModal from '@/components/studio/StudioTopupModal'

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

function StatCard({
  label, value, sub, accent = false, warn = false,
}: { label: string; value: string | number; sub?: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className={`bg-card border rounded-2xl px-5 py-4 space-y-1 ${
      warn ? 'border-yellow-400/30' : accent ? 'border-accent/30' : 'border-border'
    }`}>
      <div className={`text-2xl font-extrabold ${
        warn ? 'text-yellow-400' : accent ? 'text-accent' : 'text-text-primary'
      }`}>{value}</div>
      <div className="text-xs font-medium text-muted">{label}</div>
      {sub && <div className="text-[11px] text-muted/70">{sub}</div>}
    </div>
  )
}

function UsageCard({
  label, usedBytes, quotaBytes, onTopUp,
}: { label: string; usedBytes: number; quotaBytes: number; onTopUp: () => void }) {
  const pct = quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : 0
  const over = usedBytes > quotaBytes
  return (
    <div className={`bg-card border rounded-2xl px-5 py-4 space-y-2 ${over ? 'border-danger/30' : 'border-border'}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <button onClick={onTopUp} className="text-xs font-semibold text-accent hover:underline">Top up</button>
      </div>
      <div className="text-lg font-extrabold text-text-primary">
        {fmtBytes(usedBytes)} <span className="text-sm font-medium text-muted">/ {fmtBytes(quotaBytes)}</span>
      </div>
      <div className="h-1.5 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${over ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

interface BillingStats {
  storageUsedBytes: number
  storageGrantBytes: number
  storageOverQuota: boolean
  storageOverageStartedAt: string | null
  dataRetentionGraceDays: number
  downloadUsedBytes: number
  downloadQuotaBytes: number
}

export default function DashboardOverviewPage() {
  const [projects, setProjects]         = useState<StudioProject[]>([])
  const [studioName, setStudioName]     = useState('')
  const [storageBytes, setStorageBytes] = useState(0)
  const [billing, setBilling]           = useState<BillingStats | null>(null)
  const [loading, setLoading]           = useState(true)
  const [topupKind, setTopupKind]       = useState<'storage' | 'download' | null>(null)

  const loadStats = () => {
    fetch('/studio/api/admin/stats').then((r) => r.json()).then((sRes) => {
      if (sRes.success) {
        setStudioName(sRes.data.studioName)
        setStorageBytes(sRes.data.storageUsedBytes ?? 0)
        setBilling(sRes.data.billing ?? null)
      }
    })
  }

  useEffect(() => {
    Promise.all([
      fetch('/studio/api/admin/projects').then((r) => r.json()),
      fetch('/studio/api/admin/stats').then((r) => r.json()),
    ]).then(([pRes, sRes]) => {
      if (pRes.success) setProjects(pRes.data)
      if (sRes.success) {
        setStudioName(sRes.data.studioName)
        setStorageBytes(sRes.data.storageUsedBytes ?? 0)
        setBilling(sRes.data.billing ?? null)
      }
    }).finally(() => setLoading(false))
  }, [])

  // Placeholder "client shell" rows (New Project before any real event is
  // added) aren't real events yet — exclude them from every stat/list below
  // except the client count, since the client relationship still exists.
  const realProjects = projects.filter((p) => !p.isPlaceholder)

  const total       = realProjects.length
  const active      = realProjects.filter((p) => p.status === 'ACTIVE').length
  const selections  = realProjects.filter((p) => p.status === 'SELECTION_RECEIVED').length
  const completed   = realProjects.filter((p) => p.status === 'COMPLETED').length
  const totalPhotos = realProjects.reduce((s, p) => s + (p.totalFiles ?? 0), 0)
  const needEdits   = realProjects.reduce((s, p) => s + (p.editingRequiredCount ?? 0), 0)
  const clients     = new Set(projects.map((p) => p.clientName)).size

  const recent = [...realProjects]
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    .slice(0, 4)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-text-primary">
          {studioName || 'Dashboard'}
        </h1>
        <p className="text-sm text-muted mt-0.5">Studio overview</p>
      </div>

      {/* Analytics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard label="Total Projects"  value={total}                                                      />
        <StatCard label="Active"          value={active}    accent                                           />
        <StatCard label="Selections In"   value={selections} warn={selections > 0}
                  sub={selections > 0 ? 'Awaiting action' : undefined}                                       />
        <StatCard label="Completed"       value={completed}                                                  />
        <StatCard label="Photos Uploaded" value={totalPhotos}                                                />
        <StatCard label="Need Edits"      value={needEdits}  warn={needEdits > 0}                           />
        <StatCard label="Total Upload Size" value={fmtBytes(storageBytes)} sub="lifetime, never decreases"  />
        <StatCard label="Clients"         value={clients}                                                    />
      </div>

      {/* Billing — storage quota & downloads this month */}
      {billing && (
        <div className="space-y-3">
          {billing.storageOverQuota && (
            <div className="bg-danger/10 border border-danger/30 rounded-2xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-bold text-danger">Storage over limit</p>
                <p className="text-xs text-muted mt-0.5">
                  Top up now to avoid your oldest photos being automatically removed
                  ({billing.dataRetentionGraceDays}-day grace period from when the limit was first crossed).
                </p>
              </div>
              <button onClick={() => setTopupKind('storage')}
                className="bg-danger text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-danger/90 transition-colors flex-shrink-0">
                Top up storage
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <UsageCard
              label="Storage Quota"
              usedBytes={billing.storageUsedBytes}
              quotaBytes={billing.storageGrantBytes}
              onTopUp={() => setTopupKind('storage')}
            />
            <UsageCard
              label="Downloads This Month"
              usedBytes={billing.downloadUsedBytes}
              quotaBytes={billing.downloadQuotaBytes}
              onTopUp={() => setTopupKind('download')}
            />
          </div>
        </div>
      )}

      {topupKind && (
        <StudioTopupModal
          kind={topupKind}
          onClose={() => setTopupKind(null)}
          onSuccess={() => { setTopupKind(null); loadStats() }}
        />
      )}

      {/* Recent activity */}
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
                  <div className="text-xs text-muted">{(p.eventType ?? '').replace(/_/g, ' ')} · {fmtDate(p.eventDate)}</div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${STATUS_COLOR[p.status] ?? 'bg-border text-muted'}`}>
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {projects.length === 0 && (
        <div className="text-center py-16 space-y-4">
          <div className="text-5xl">📷</div>
          <div className="text-text-primary font-semibold text-lg">No projects yet</div>
          <div className="text-muted text-sm">Create your first project to get started</div>
          <Link
            href="/studio/dashboard/projects/new"
            className="inline-block bg-accent text-bg text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-accent/90 transition-colors mt-2"
          >
            Create Project
          </Link>
        </div>
      )}
    </div>
  )
}
