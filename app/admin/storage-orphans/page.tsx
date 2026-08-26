'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import ConfirmButton from '@/components/admin/ConfirmButton'

interface OrphanObject { key: string; size: number; fileName: string; formerStatus: string }
interface OrphanUserGroup { walletId: string | null; name: string; email: string; totalBytes: number; objects: OrphanObject[] }
interface OrphanData { groups: OrphanUserGroup[]; totalOrphanBytes: number; lastSyncedAt: string }

interface IncompleteUploadItem { key: string; uploadId: string; initiated: string; fileName: string; status: string; sizeBytes: number | null }
interface IncompleteUploadGroup { walletId: string | null; name: string; email: string; items: IncompleteUploadItem[] }
interface IncompleteUploadData { groups: IncompleteUploadGroup[]; totalCount: number; asOf: string }

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

  const [incomplete, setIncomplete] = useState<IncompleteUploadData | null>(null)
  const [incompleteLoading, setIncompleteLoading] = useState(true)
  const [incExpanded, setIncExpanded] = useState<string | null>(null)
  const [incActionMsg, setIncActionMsg] = useState<string | null>(null)
  const [incBusy, setIncBusy] = useState(false)

  const load = () => {
    setLoading(true)
    fetch('/api/admin/storage-orphans')
      .then((r) => r.json())
      .then((res) => { if (res.success) setData(res.data) })
      .finally(() => setLoading(false))
  }

  const loadIncomplete = () => {
    setIncompleteLoading(true)
    fetch('/api/admin/storage-orphans/incomplete-uploads')
      .then((r) => r.json())
      .then((res) => { if (res.success) setIncomplete(res.data) })
      .finally(() => setIncompleteLoading(false))
  }

  useEffect(load, [])
  useEffect(loadIncomplete, [])

  const groupKey = (g: OrphanUserGroup) => g.walletId ?? '__unknown__'

  // The server only processes a bounded batch per call (Vercel's ~10s
  // serverless limit made a single request handling hundreds of deletes
  // unreliable in production — it got killed mid-flight with nothing
  // persisted). Keep calling with the same target until `remaining` is 0,
  // showing running progress instead of one long silent wait.
  const doDelete = async (body: { target: 'user'; walletId: string } | { target: 'unknown' } | { target: 'all' }) => {
    setBusy(true)
    let totalDeleted = 0
    let totalSkipped = 0
    let totalBytesFreed = 0
    try {
      while (true) {
        const res = await fetch('/api/admin/storage-orphans/delete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }).then((r) => r.json())

        if (!res.success) {
          setActionMsg(res.message ?? 'Failed')
          break
        }

        totalDeleted += res.data.deleted
        totalSkipped += res.data.skipped
        totalBytesFreed += res.data.bytesFreed
        setActionMsg(`Deleting… ${totalDeleted} file${totalDeleted !== 1 ? 's' : ''} removed so far (${formatBytes(totalBytesFreed)})${res.data.remaining > 0 ? `, ${res.data.remaining} left` : ''}`)

        if (res.data.remaining === 0) {
          setActionMsg(`Deleted ${totalDeleted} file${totalDeleted !== 1 ? 's' : ''} (${formatBytes(totalBytesFreed)}), skipped ${totalSkipped}.`)
          break
        }
      }
      load()
    } finally {
      setBusy(false)
    }
  }

  const incGroupKey = (g: IncompleteUploadGroup) => g.walletId ?? '__unknown__'

  // Sizes require one ListParts call per upload, so they're never fetched
  // up front — computed lazily, in batches, purely client-driven (nothing
  // about this list is cached server-side, see the API route's comment on
  // why). This walks the already-loaded list, sends unsized items to the
  // sizes endpoint in chunks, and merges the results back into state.
  const computeSizes = async () => {
    if (!incomplete) return
    setIncBusy(true)
    const CHUNK = 80
    let totalComputed = 0
    try {
      const unsized = incomplete.groups.flatMap((g) => g.items.filter((i) => i.sizeBytes === null))
      for (let i = 0; i < unsized.length; i += CHUNK) {
        const chunk = unsized.slice(i, i + CHUNK).map((it) => ({ key: it.key, uploadId: it.uploadId }))
        const res = await fetch('/api/admin/storage-orphans/incomplete-uploads/sizes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: chunk }),
        }).then((r) => r.json())
        if (!res.success) { setIncActionMsg(res.message ?? 'Failed'); break }

        const sizeByUploadId = new Map<string, number>(res.data.sizes.map((s: { uploadId: string; sizeBytes: number }) => [s.uploadId, s.sizeBytes]))
        totalComputed += sizeByUploadId.size
        setIncomplete((prev) => prev && ({
          ...prev,
          groups: prev.groups.map((g) => ({
            ...g,
            items: g.items.map((it) => sizeByUploadId.has(it.uploadId) ? { ...it, sizeBytes: sizeByUploadId.get(it.uploadId)! } : it),
          })),
        }))
        setIncActionMsg(`Calculating sizes… ${totalComputed}/${unsized.length} done`)
      }
      setIncActionMsg(totalComputed > 0 ? `Sizes calculated for ${totalComputed} upload${totalComputed !== 1 ? 's' : ''}.` : null)
    } finally {
      setIncBusy(false)
    }
  }

  // Same batched/resumable abort loop as doDelete — see that function's
  // comment. The server re-derives the live list itself on every call and
  // filters to eligible items (see lib/r2IncompleteUploads.ts's safety
  // rule), so `remaining` here always reflects fresh reality.
  const doAbort = async (body: { target: 'user'; walletId: string } | { target: 'unknown' } | { target: 'all' }) => {
    setIncBusy(true)
    let totalAborted = 0
    try {
      while (true) {
        const res = await fetch('/api/admin/storage-orphans/incomplete-uploads/abort', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }).then((r) => r.json())

        if (!res.success) { setIncActionMsg(res.message ?? 'Failed'); break }

        totalAborted += res.data.aborted
        setIncActionMsg(`Aborting… ${totalAborted} upload${totalAborted !== 1 ? 's' : ''} aborted so far${res.data.remaining > 0 ? `, ${res.data.remaining} left` : ''}`)

        if (res.data.remaining === 0) {
          setIncActionMsg(`Aborted ${totalAborted} incomplete upload${totalAborted !== 1 ? 's' : ''}. Uploads still within the 6h grace window are left alone until they age past it.`)
          break
        }
      }
      loadIncomplete()
    } finally {
      setIncBusy(false)
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

      <div className="bg-card border border-border rounded-2xl p-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-bold text-text-primary text-lg">Incomplete Uploads</div>
          <p className="text-xs text-muted mt-1 max-w-lg">
            Parts already uploaded for a multipart upload that was never completed or aborted — real, billed
            bytes invisible to the "Actually in R2" stat above (it can only see finished files). This is usually
            the real explanation when Cloudflare&apos;s own bucket-size total runs far ahead of that number.
            Cloudflare auto-aborts these after 7 days on its own; this lets you do it sooner, safely.
          </p>
          {incomplete && (
            <div className="text-xs text-muted mt-2">
              {incomplete.totalCount} upload{incomplete.totalCount !== 1 ? 's' : ''} · as of {timeAgo(incomplete.asOf)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={loadIncomplete} disabled={incBusy} className="text-xs font-semibold text-text-primary border border-border px-3 py-1.5 rounded-lg hover:bg-border/30 transition-colors disabled:opacity-50">
            Refresh
          </button>
          {incomplete && incomplete.groups.length > 0 && (
            <button onClick={computeSizes} disabled={incBusy} className="text-xs font-semibold text-text-primary border border-border px-3 py-1.5 rounded-lg hover:bg-border/30 transition-colors disabled:opacity-50">
              Calculate Sizes
            </button>
          )}
          {incomplete && incomplete.groups.length > 0 && (
            <ConfirmButton
              label="Abort All Eligible"
              confirmLabel="Confirm abort"
              onConfirm={() => doAbort({ target: 'all' })}
              disabled={incBusy}
              className="text-xs font-semibold bg-danger/10 text-danger border border-danger/30 px-3 py-1.5 rounded-lg hover:bg-danger/20 transition-colors disabled:opacity-50"
            />
          )}
        </div>
      </div>

      {incActionMsg && <div className="text-xs text-muted">{incActionMsg}</div>}

      {incompleteLoading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !incomplete ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center text-sm text-muted">
          Failed to load — click Refresh above.
        </div>
      ) : incomplete.groups.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center text-sm text-muted">
          No incomplete uploads found.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Uploads</th>
                <th className="px-4 py-2 font-medium">Size</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {incomplete.groups.map((g) => {
                const knownBytes = g.items.reduce((s, i) => s + (i.sizeBytes ?? 0), 0)
                const allSized = g.items.every((i) => i.sizeBytes !== null)
                return (
                  <Fragment key={incGroupKey(g)}>
                    <tr className="border-b border-border last:border-0 hover:bg-border/20 transition-colors">
                      <td className="px-4 py-2.5">
                        <button onClick={() => setIncExpanded((e) => (e === incGroupKey(g) ? null : incGroupKey(g)))} className="text-left">
                          <div className="text-text-primary font-medium">{g.name}</div>
                          <div className="text-xs text-muted">{g.email}</div>
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-muted">{g.items.length}</td>
                      <td className="px-4 py-2.5 text-text-primary font-medium tabular-nums">
                        {knownBytes > 0 || allSized ? formatBytes(knownBytes) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <ConfirmButton
                          label="Abort"
                          confirmLabel="Confirm"
                          disabled={incBusy}
                          onConfirm={() => doAbort(g.walletId ? { target: 'user', walletId: g.walletId } : { target: 'unknown' })}
                          className="text-xs font-semibold text-danger hover:underline disabled:opacity-50"
                        />
                      </td>
                    </tr>
                    {incExpanded === incGroupKey(g) && (
                      <tr className="border-b border-border last:border-0 bg-bg/50">
                        <td colSpan={4} className="px-4 py-3">
                          <div className="space-y-1.5 max-h-56 overflow-y-auto">
                            {g.items.map((i) => (
                              <div key={i.uploadId} className="flex items-center justify-between gap-3 text-xs">
                                <span className="text-text-primary truncate max-w-[240px]" title={i.key}>{i.fileName}</span>
                                <span className="text-muted flex-shrink-0 capitalize">{i.status}</span>
                                <span className="text-muted flex-shrink-0">{timeAgo(i.initiated)}</span>
                                <span className="text-muted flex-shrink-0">{i.sizeBytes !== null ? formatBytes(i.sizeBytes) : '— size unknown'}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
