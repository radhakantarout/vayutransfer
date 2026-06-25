'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { StudioProject } from '@/types/studio'

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

export default function DashboardPage() {
  const [projects, setProjects]         = useState<StudioProject[]>([])
  const [studioName, setStudioName]     = useState('')
  const [storageBytes, setStorageBytes] = useState(0)
  const [loading, setLoading]           = useState(true)

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

  const total       = projects.length
  const active      = projects.filter((p) => p.status === 'ACTIVE').length
  const selections  = projects.filter((p) => p.status === 'SELECTION_RECEIVED').length
  const completed   = projects.filter((p) => p.status === 'COMPLETED').length
  const totalPhotos = projects.reduce((s, p) => s + (p.totalFiles ?? 0), 0)
  const needEdits   = projects.reduce((s, p) => s + (p.editingRequiredCount ?? 0), 0)
  const clients     = new Set(projects.map((p) => p.clientName)).size

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
        <StatCard label="Storage Used"    value={fmtBytes(storageBytes)} sub="across all projects"          />
        <StatCard label="Clients"         value={clients}                                                    />
      </div>

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

      {/* Empty state */}
      {total === 0 && (
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
