'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { AuditLog } from '@/types/studio'

type Period = 'daily' | 'monthly' | 'yearly'

interface Summary {
  totalClients: number
  totalEvents: number
  uploadBytes: number
  downloadBytes: number | null
  downloadGranularity: 'daily' | 'monthly' | 'yearly' | 'unavailable'
}

interface UploadRow {
  fileId: string
  projectId: string
  clientName: string
  originalFilename: string
  sizeBytes: number
  uploadedAt: string
}

function formatBytes(bytes: number) {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ISO date (yyyy-mm-dd) for <input type="date"> — local helper since this
// page is the only place that needs to round-trip through date inputs.
function toDateInput(iso: string) {
  return iso.slice(0, 10)
}

const DELETE_ACTION_LABEL: Record<string, string> = {
  DELETE_PHOTOS: 'Deleted photos',
  DELETE_PROJECT: 'Deleted event',
  DELETE_CLIENT: 'Deleted client',
}

function deleteSummaryLine(entry: AuditLog): string {
  const m = entry.metadata ?? {}
  const parts: string[] = []
  if (typeof m.photoCount === 'number') parts.push(`${m.photoCount} photo${m.photoCount !== 1 ? 's' : ''}`)
  if (typeof m.projectCount === 'number') parts.push(`${m.projectCount} event${m.projectCount !== 1 ? 's' : ''}`)
  if (typeof m.totalBytes === 'number') parts.push(formatBytes(m.totalBytes))
  if (typeof m.clientName === 'string') parts.push(String(m.clientName))
  return parts.join(' · ') || '—'
}

export default function StudioPerformancePage() {
  const { studioId } = useParams<{ studioId: string }>()

  const [studioName, setStudioName] = useState('')
  const [loadingHeader, setLoadingHeader] = useState(true)

  const [period, setPeriod] = useState<Period>('monthly')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)

  const [deletesFrom, setDeletesFrom] = useState(toDateInput(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()))
  const [deletesTo, setDeletesTo] = useState(toDateInput(new Date().toISOString()))
  const [deletes, setDeletes] = useState<AuditLog[] | null>(null)
  const [deletesLoading, setDeletesLoading] = useState(true)

  const [uploadsFrom, setUploadsFrom] = useState(toDateInput(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()))
  const [uploadsTo, setUploadsTo] = useState(toDateInput(new Date().toISOString()))
  const [uploads, setUploads] = useState<UploadRow[] | null>(null)
  const [uploadsLoading, setUploadsLoading] = useState(true)

  useEffect(() => {
    fetch(`/studio/api/owner/studios/${studioId}`).then((r) => r.json()).then((res) => {
      if (res.success) setStudioName(res.data.studio.name)
    }).finally(() => setLoadingHeader(false))
  }, [studioId])

  useEffect(() => {
    setSummaryLoading(true)
    fetch(`/studio/api/owner/studios/${studioId}/performance?view=summary&period=${period}`)
      .then((r) => r.json()).then((res) => { if (res.success) setSummary(res.data) })
      .finally(() => setSummaryLoading(false))
  }, [studioId, period])

  const loadDeletes = () => {
    setDeletesLoading(true)
    const from = new Date(deletesFrom).toISOString()
    const to = new Date(`${deletesTo}T23:59:59.999Z`).toISOString()
    fetch(`/studio/api/owner/studios/${studioId}/performance?view=deletes&from=${from}&to=${to}`)
      .then((r) => r.json()).then((res) => { if (res.success) setDeletes(res.data.items) })
      .finally(() => setDeletesLoading(false))
  }
  useEffect(loadDeletes, [studioId]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadUploads = () => {
    setUploadsLoading(true)
    const from = new Date(uploadsFrom).toISOString()
    const to = new Date(`${uploadsTo}T23:59:59.999Z`).toISOString()
    fetch(`/studio/api/owner/studios/${studioId}/performance?view=uploads&from=${from}&to=${to}`)
      .then((r) => r.json()).then((res) => { if (res.success) setUploads(res.data.items) })
      .finally(() => setUploadsLoading(false))
  }
  useEffect(loadUploads, [studioId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      <div>
        <Link href="/studio/admin/studios" className="text-xs text-muted hover:text-text-primary transition-colors">← Studios</Link>
        <h1 className="text-2xl font-bold text-text-primary mt-1">
          {loadingHeader ? 'Loading…' : studioName} <span className="text-muted font-normal text-base">— Performance</span>
        </h1>
      </div>

      {/* Period toggle + summary cards */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          {(['daily', 'monthly', 'yearly'] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors capitalize ${
                period === p ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border text-muted hover:text-text-primary'
              }`}>
              {p}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total clients', value: summary?.totalClients ?? '—' },
            { label: 'Total events', value: summary?.totalEvents ?? '—' },
            { label: `Uploaded (${period})`, value: summary ? formatBytes(summary.uploadBytes) : '—' },
            {
              label: `Downloaded (${period})`,
              value: summaryLoading ? '—' : summary?.downloadGranularity === 'unavailable'
                ? 'Not tracked daily'
                : formatBytes(summary?.downloadBytes ?? 0),
            },
          ].map(({ label, value }) => (
            <div key={label} className="bg-card border border-border rounded-xl px-4 py-3">
              <div className="text-xl font-bold text-text-primary">{summaryLoading ? '…' : value}</div>
              <div className="text-xs text-muted mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent deletes */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-base font-bold text-text-primary">Recent deletes</h2>
          <div className="flex items-center gap-2">
            <input type="date" value={deletesFrom} onChange={(e) => setDeletesFrom(e.target.value)}
              className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent" />
            <span className="text-xs text-muted">to</span>
            <input type="date" value={deletesTo} onChange={(e) => setDeletesTo(e.target.value)}
              className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent" />
            <button onClick={loadDeletes} className="bg-accent text-bg text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-accent/90 transition-colors">
              Search
            </button>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
          {deletesLoading ? (
            <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
          ) : !deletes || deletes.length === 0 ? (
            <p className="text-sm text-muted text-center py-10">No deletes in this range.</p>
          ) : (
            deletes.map((d) => (
              <div key={d.auditId} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-semibold text-text-primary">
                    {DELETE_ACTION_LABEL[d.action] ?? d.action}
                    {d.actorRole === 'SYSTEM' && <span className="ml-2 text-[10px] font-semibold text-muted bg-border/50 px-1.5 py-0.5 rounded">AUTOMATIC</span>}
                  </div>
                  <div className="text-xs text-muted mt-0.5 truncate">{deleteSummaryLine(d)}</div>
                </div>
                <div className="text-xs text-muted text-right flex-shrink-0">{fmtDateTime(d.createdAt)}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recent uploads */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-base font-bold text-text-primary">Recent uploads</h2>
          <div className="flex items-center gap-2">
            <input type="date" value={uploadsFrom} onChange={(e) => setUploadsFrom(e.target.value)}
              className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent" />
            <span className="text-xs text-muted">to</span>
            <input type="date" value={uploadsTo} onChange={(e) => setUploadsTo(e.target.value)}
              className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent" />
            <button onClick={loadUploads} className="bg-accent text-bg text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-accent/90 transition-colors">
              Search
            </button>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border max-h-96 overflow-y-auto">
          {uploadsLoading ? (
            <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
          ) : !uploads || uploads.length === 0 ? (
            <p className="text-sm text-muted text-center py-10">No uploads in this range.</p>
          ) : (
            uploads.map((u) => (
              <div key={u.fileId} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="text-text-primary truncate">{u.originalFilename}</div>
                  <div className="text-xs text-muted mt-0.5">{u.clientName} · {formatBytes(u.sizeBytes)}</div>
                </div>
                <div className="text-xs text-muted text-right flex-shrink-0">{fmtDateTime(u.uploadedAt)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
