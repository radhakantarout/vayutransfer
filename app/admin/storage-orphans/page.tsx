'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import ConfirmButton from '@/components/admin/ConfirmButton'

interface OrphanObject { key: string; size: number; fileName: string; formerStatus: string }
interface OrphanUserGroup { walletId: string | null; name: string; email: string; totalBytes: number; objects: OrphanObject[] }
interface OrphanData { groups: OrphanUserGroup[]; totalOrphanBytes: number; lastSyncedAt: string }

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

export default function AdminStorageOrphansPage() {
  const [data, setData] = useState<OrphanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true)
    fetch('/api/admin/storage-orphans')
      .then((r) => r.json())
      .then((res) => { if (res.success) setData(res.data) })
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const groupKey = (g: OrphanUserGroup) => g.walletId ?? '__unknown__'

  const doDelete = async (body: { target: 'user'; walletId: string } | { target: 'unknown' } | { target: 'all' }) => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/storage-orphans/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }).then((r) => r.json())
      setActionMsg(res.success
        ? `Deleted ${res.data.deleted} file${res.data.deleted !== 1 ? 's' : ''} (${formatBytes(res.data.bytesFreed)}), skipped ${res.data.skipped}.`
        : res.message ?? 'Failed')
      load()
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link href="/admin" className="text-sm text-muted hover:text-text-primary">← Back to Overview</Link>

      <div className="bg-card border border-border rounded-2xl p-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-bold text-text-primary text-lg">Orphaned Storage</div>
          <p className="text-xs text-muted mt-1 max-w-lg">
            Real files in R2 whose transfer is already failed or deleted (or untraceable) — never anything active,
            pending, or expired. Re-verified live right before deletion, not just from this cached list.
          </p>
          {data && (
            <div className="text-xs text-muted mt-2">
              {formatBytes(data.totalOrphanBytes)} total · last synced {timeAgo(data.lastSyncedAt)}
            </div>
          )}
        </div>
        {data && data.groups.length > 0 && (
          <ConfirmButton
            label="Delete All Orphans"
            confirmLabel="Confirm delete all"
            onConfirm={() => doDelete({ target: 'all' })}
            disabled={busy}
            className="text-xs font-semibold bg-danger/10 text-danger border border-danger/30 px-3 py-1.5 rounded-lg hover:bg-danger/20 transition-colors disabled:opacity-50"
          />
        )}
      </div>

      {actionMsg && <div className="text-xs text-muted">{actionMsg}</div>}

      {!data ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center text-sm text-muted">
          No scan yet — go to <Link href="/admin" className="text-accent hover:underline">Overview</Link> and click Sync Now.
        </div>
      ) : data.groups.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center text-sm text-muted">
          No orphaned storage found. Everything in R2 is accounted for.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Files</th>
                <th className="px-4 py-2 font-medium">Size</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {data.groups.map((g) => (
                <Fragment key={groupKey(g)}>
                  <tr className="border-b border-border last:border-0 hover:bg-border/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <button onClick={() => setExpanded((e) => (e === groupKey(g) ? null : groupKey(g)))} className="text-left">
                        <div className="text-text-primary font-medium">{g.name}</div>
                        <div className="text-xs text-muted">{g.email}</div>
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-muted">{g.objects.length}</td>
                    <td className="px-4 py-2.5 text-text-primary font-medium tabular-nums">{formatBytes(g.totalBytes)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <ConfirmButton
                        label="Delete"
                        confirmLabel="Confirm"
                        disabled={busy}
                        onConfirm={() => doDelete(g.walletId ? { target: 'user', walletId: g.walletId } : { target: 'unknown' })}
                        className="text-xs font-semibold text-danger hover:underline disabled:opacity-50"
                      />
                    </td>
                  </tr>
                  {expanded === groupKey(g) && (
                    <tr className="border-b border-border last:border-0 bg-bg/50">
                      <td colSpan={4} className="px-4 py-3">
                        <div className="space-y-1.5 max-h-56 overflow-y-auto">
                          {g.objects.map((o) => (
                            <div key={o.key} className="flex items-center justify-between gap-3 text-xs">
                              <span className="text-text-primary truncate max-w-[280px]" title={o.key}>{o.fileName}</span>
                              <span className="text-muted flex-shrink-0 capitalize">{o.formerStatus}</span>
                              <span className="text-muted flex-shrink-0">{formatBytes(o.size)}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
