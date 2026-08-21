'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useWallet } from '@/lib/wallet-context'
import { useUpload } from '@/lib/upload-context'
import { getExtensionCostPaise, formatPaise } from '@/lib/pricing'
import { EXPIRY_DAY_OPTIONS, MAX_EXPIRY_DAYS_FROM_UPLOAD } from '@/constants/pricing'
import ShareButtons from '@/components/ShareButtons'
import ReceiveRequestsPanel from '@/components/ReceiveRequestsPanel'
import {
  FileTypeIcon, fileTypeColor, PackageIcon, FolderIcon, InboxIcon, CopyIcon, ShareIcon,
  ClockIcon, DownloadIcon, PlusCircleIcon, CheckCircleIcon, EditIcon, TrashIcon, SearchIcon,
} from '@/components/icons'
import type { Transfer } from '@/types'

const EXTEND_TARGETS = [...EXPIRY_DAY_OPTIONS, MAX_EXPIRY_DAYS_FROM_UPLOAD] as const
const PAGE_SIZE = 10

type Tab = 'all' | 'requests' | 'trash'
type StatusFilter = 'all' | 'active' | 'expired' | 'failed' | 'pending'
type SortOption = 'newest' | 'oldest' | 'largest'

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function isExpired(t: Transfer): boolean {
  return t.status === 'expired' || new Date(t.expiryTime) < new Date()
}

function statusBadge(status: Transfer['status'], expired: boolean) {
  if (expired) return { label: 'Expired', cls: 'bg-danger/10 text-danger' }
  switch (status) {
    case 'active': return { label: 'Active', cls: 'bg-success/10 text-success' }
    case 'failed': return { label: 'Failed', cls: 'bg-danger/10 text-danger' }
    case 'pending': return { label: 'Uploading…', cls: 'bg-accent/10 text-accent' }
    default: return { label: status, cls: 'bg-bg text-muted' }
  }
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs text-muted truncate">{label}</div>
        <div className="text-lg font-bold text-text-primary mt-0.5 tabular-nums truncate">{value}</div>
      </div>
      <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
    </div>
  )
}

export default function TransfersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { refreshBalance } = useWallet()
  const { uploads } = useUpload()
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const [tab, setTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortOption, setSortOption] = useState<SortOption>('newest')
  const [page, setPage] = useState(1)

  // Share state
  const [sharingFor, setSharingFor] = useState<string | null>(null)

  // Activity (download history) state — lazy-loaded per transfer, cached
  // once fetched so re-toggling open doesn't re-fetch.
  const [activityFor, setActivityFor] = useState<string | null>(null)
  const [activityData, setActivityData] = useState<Record<string, { downloadId: string; attemptedAt: string; outcome: string; countryCode?: string }[]>>({})
  const [activityLoading, setActivityLoading] = useState<string | null>(null)

  // Extend-expiry state
  const [extendingFor, setExtendingFor] = useState<string | null>(null)
  const [extending, setExtending] = useState(false)
  const [extendError, setExtendError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
  }, [status, router])

  useEffect(() => {
    if (!session) return
    fetch('/api/transfers')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setTransfers(d.data)
        else setError(d.message ?? 'Failed to load transfers')
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false))
  }, [session])

  // Reset to page 1 whenever the active view/filter/sort/tab changes so a
  // stale page number can't land on an empty page.
  useEffect(() => { setPage(1) }, [tab, search, statusFilter, sortOption])

  const copyLink = async (fileId: string) => {
    const appUrl = window.location.origin
    await navigator.clipboard.writeText(`${appUrl}/download/${fileId}`)
    setCopied(fileId)
    setTimeout(() => setCopied(null), 2000)
  }

  const toggleActivity = async (fileId: string) => {
    if (activityFor === fileId) { setActivityFor(null); return }
    setActivityFor(fileId)
    if (activityData[fileId]) return // already fetched, just show it
    setActivityLoading(fileId)
    try {
      const res = await fetch(`/api/transfers/${fileId}/activity`).then((r) => r.json())
      if (res.success) setActivityData((prev) => ({ ...prev, [fileId]: res.data.attempts }))
    } finally {
      setActivityLoading(null)
    }
  }

  const confirmExtend = async (fileId: string, targetDays: number) => {
    setExtending(true)
    setExtendError(null)
    try {
      const res = await fetch(`/api/transfers/${fileId}/extend-expiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDays }),
      })
      const data = await res.json()
      if (!data.success) {
        setExtendError(data.message ?? 'Failed to extend')
        return
      }
      const refreshed = await fetch('/api/transfers').then((r) => r.json())
      if (refreshed.success) setTransfers(refreshed.data)
      refreshBalance()
      setExtendingFor(null)
    } catch {
      setExtendError('Network error — please try again')
    } finally {
      setExtending(false)
    }
  }

  if (status === 'loading' || !session) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const nonDeleted = transfers.filter((t) => t.status !== 'deleted')
  const deletedTransfers = transfers.filter((t) => t.status === 'deleted')

  // Stat cards — every number here is derived from the already-fetched
  // `transfers` array, no extra requests.
  const totalSizeBytes = nonDeleted.reduce((s, t) => s + t.fileSizeBytes, 0)
  const totalDownloads = nonDeleted.reduce((s, t) => s + t.downloadsUsed, 0)
  const activeCount = nonDeleted.filter((t) => t.status === 'active' && !isExpired(t)).length
  const expiredCount = nonDeleted.filter(isExpired).length

  const matchesStatusFilter = (t: Transfer) => {
    switch (statusFilter) {
      case 'all': return true
      case 'active': return t.status === 'active' && !isExpired(t)
      case 'expired': return isExpired(t)
      case 'failed': return t.status === 'failed'
      case 'pending': return t.status === 'pending'
    }
  }

  const searchQuery = search.trim().toLowerCase()
  const matchesSearch = (t: Transfer) => {
    if (!searchQuery) return true
    const title = (t.displayName ?? t.fileName).toLowerCase()
    const emails = (t.recipientEmails ?? []).join(' ').toLowerCase()
    return title.includes(searchQuery) || emails.includes(searchQuery)
  }

  const filtered = nonDeleted.filter((t) => matchesStatusFilter(t) && matchesSearch(t))
  filtered.sort((a, b) => {
    if (sortOption === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    if (sortOption === 'largest') return b.fileSizeBytes - a.fileSizeBytes
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const TABS: { key: Tab; label: string }[] = [
    { key: 'all', label: 'All Transfers' },
    { key: 'requests', label: 'Requested by Me' },
    { key: 'trash', label: 'Trash' },
  ]

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6 gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">My Transfers</h1>
          <p className="text-sm text-muted mt-0.5">All your shared links, uploads and requests in one place.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/transfer/request"
            className="flex items-center gap-1.5 bg-card border border-border text-text-primary text-sm font-semibold px-4 py-2 rounded-xl hover:border-accent/60 hover:shadow-sm transition-all"
          >
            <InboxIcon className="w-4 h-4" />
            Request a File
          </Link>
          <Link
            href="/transfer/new"
            className="flex items-center gap-1.5 bg-accent text-bg text-sm font-semibold px-4 py-2 rounded-xl hover:bg-accent/90 hover:shadow-md transition-all"
          >
            <PlusCircleIcon className="w-4 h-4" />
            New Transfer
          </Link>
        </div>
      </div>

      {!loading && !error && transfers.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          <StatCard label="Total Transfers" value={nonDeleted.length.toLocaleString('en-IN')} icon={<PackageIcon className="w-4 h-4" />} />
          <StatCard label="Total Size" value={formatBytes(totalSizeBytes)} icon={<FolderIcon className="w-4 h-4" />} />
          <StatCard label="Total Downloads" value={totalDownloads.toLocaleString('en-IN')} icon={<DownloadIcon className="w-4 h-4" />} />
          <StatCard label="Active" value={activeCount.toLocaleString('en-IN')} icon={<CheckCircleIcon className="w-4 h-4" />} />
          <StatCard label="Expired" value={expiredCount.toLocaleString('en-IN')} icon={<ClockIcon className="w-4 h-4" />} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border mb-5 overflow-x-auto">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === key ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-text-primary'
            }`}
          >
            {label}
            {key === 'trash' && deletedTransfers.length > 0 && (
              <span className="ml-1.5 text-[11px] text-muted">({deletedTransfers.length})</span>
            )}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {!loading && !error && tab === 'all' && transfers.length === 0 && (
        <div className="text-center py-20 space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-b from-accent to-[#7C3AED] text-white flex items-center justify-center shadow-lg shadow-accent/25">
            <PackageIcon className="w-8 h-8" />
          </div>
          <div>
            <div className="text-text-primary font-bold text-xl">
              Welcome{session?.user?.name ? `, ${session.user.name.split(' ')[0]}` : ''}!
            </div>
            <div className="text-muted text-sm mt-1">Your transfers will show up here once you send your first file.</div>
          </div>
          <Link href="/transfer/new" className="inline-block bg-gradient-to-r from-accent to-[#7C3AED] text-white text-sm font-bold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity mt-2 shadow-md shadow-accent/20">
            Send Your First File
          </Link>
        </div>
      )}

      {!loading && !error && tab === 'all' && transfers.length > 0 && (
        <>
          {/* Toolbar */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <SearchIcon className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title or email…"
                className="w-full bg-card border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/60"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="failed">Failed</option>
              <option value="pending">Uploading</option>
            </select>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/60"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="largest">Largest first</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted">No transfers match your search/filters.</div>
          ) : (
            <div className="space-y-3">
              {pageItems.map((t) => {
                const expired = isExpired(t)
                const isSharing = sharingFor === t.fileId
                const isActivityOpen = activityFor === t.fileId
                const attempts = activityData[t.fileId]
                const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
                const shareLink = `${appUrl}/download/${t.fileId}`
                const badge = statusBadge(t.status, expired)
                const title = t.displayName ?? t.fileName
                // Only live/clickable if this browser tab is still tracking the
                // upload in memory — the global upload context isn't persisted,
                // so a different tab/device or a page reload has no way to
                // resume showing its live progress.
                const liveUpload = t.status === 'pending'
                  ? uploads.find((u) => u.transferId === t.fileId && (u.status === 'uploading' || u.status === 'partial'))
                  : undefined

                // Expiry extension — deliberately allowed even once expired-by-time,
                // as long as the target still lands before the file's real
                // physical delete (createdAt + MAX_EXPIRY_DAYS_FROM_UPLOAD).
                const currentExpiryDays = t.expiryDays ?? EXPIRY_DAY_OPTIONS[0]
                const extendTargets = EXTEND_TARGETS.filter((d) => d > currentExpiryDays)
                const maxPossibleExpiry = new Date(t.createdAt).getTime() + MAX_EXPIRY_DAYS_FROM_UPLOAD * 24 * 60 * 60 * 1000
                const canExtendExpiry = t.status !== 'failed' && extendTargets.length > 0 && maxPossibleExpiry > Date.now()
                const isExtending = extendingFor === t.fileId
                const extensionUnitCost = getExtensionCostPaise(t.fileSizeBytes)

                return (
                  <div key={t.fileId} className="bg-card border border-border rounded-2xl p-5 space-y-3 hover:border-accent/30 hover:shadow-sm transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className={`w-10 h-10 rounded-xl bg-bg flex items-center justify-center flex-shrink-0 ${fileTypeColor(t.fileName, !!t.fileCount)}`}>
                          {t.fileCount ? <PackageIcon className="w-5 h-5" /> : <FileTypeIcon fileName={t.fileName} className="w-5 h-5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-text-primary truncate">{title}</span>
                            {liveUpload ? (
                              <button
                                onClick={() => router.push(`/transfer/new?tx=${t.fileId}`)}
                                title="View upload progress"
                                className={`text-[11px] font-medium px-2 py-0.5 rounded-full hover:underline cursor-pointer ${badge.cls}`}
                              >
                                {badge.label} ({liveUpload.percent}%)
                              </button>
                            ) : (
                              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>
                                {badge.label}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2.5 text-xs text-muted mt-1 flex-wrap">
                            <span>{formatBytes(t.fileSizeBytes)}</span>
                            <span>·</span>
                            <span>{t.downloadsUsed} download{t.downloadsUsed !== 1 ? 's' : ''}</span>
                            <span>·</span>
                            <span>{formatPaise(t.amountDeducted)}</span>
                            <span>·</span>
                            <span>{new Date(t.createdAt).toLocaleDateString('en-IN')}</span>
                            <span>·</span>
                            <span>{expired ? 'expired' : 'expires'} {new Date(t.expiryTime).toLocaleDateString('en-IN')}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {!expired && t.status === 'active' && (
                          <button
                            onClick={() => copyLink(t.fileId)}
                            title="Copy link"
                            className="flex items-center gap-1.5 text-xs bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 px-3 py-1.5 rounded-lg transition-colors font-medium"
                          >
                            {copied === t.fileId ? <CheckCircleIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
                            {copied === t.fileId ? 'Copied' : 'Copy'}
                          </button>
                        )}
                        {!expired && t.status === 'active' && (
                          <button
                            onClick={() => setSharingFor(isSharing ? null : t.fileId)}
                            title="Share"
                            className={`p-1.5 border rounded-lg transition-colors ${isSharing ? 'bg-accent/10 border-accent text-accent' : 'border-border text-muted hover:border-accent hover:text-accent'}`}
                          >
                            <ShareIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canExtendExpiry && (
                          <button
                            onClick={() => { setExtendError(null); setExtendingFor(isExtending ? null : t.fileId) }}
                            title={expired ? 'Revive link' : 'Extend'}
                            className={`p-1.5 border rounded-lg transition-colors ${isExtending ? 'bg-accent/10 border-accent text-accent' : 'border-border text-muted hover:border-accent hover:text-accent'}`}
                          >
                            <ClockIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => toggleActivity(t.fileId)}
                          title="Activity"
                          className={`p-1.5 border rounded-lg transition-colors ${isActivityOpen ? 'bg-accent/10 border-accent text-accent' : 'border-border text-muted hover:border-accent hover:text-accent'}`}
                        >
                          <DownloadIcon className="w-3.5 h-3.5" />
                        </button>
                        <Link
                          href={`/transfer/${t.fileId}`}
                          title="Manage"
                          className="p-1.5 border rounded-lg transition-colors border-border text-muted hover:border-accent hover:text-accent"
                        >
                          <EditIcon className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>

                    {/* Inline share */}
                    {isSharing && (
                      <div className="border-t border-border pt-3">
                        <ShareButtons link={shareLink} fileName={title} size="sm" />
                      </div>
                    )}

                    {/* Inline expiry extender */}
                    {isExtending && (
                      <div className="border-t border-border pt-3 space-y-3">
                        <div className="text-sm text-text-primary font-medium">
                          {expired ? 'Revive this link — extend its retention' : 'Extend link retention'}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {extendTargets.map((days) => {
                            const steps = EXTEND_TARGETS.indexOf(days) - EXTEND_TARGETS.indexOf(currentExpiryDays as typeof EXTEND_TARGETS[number])
                            const cost = extensionUnitCost * Math.max(1, steps)
                            return (
                              <button
                                key={days}
                                onClick={() => confirmExtend(t.fileId, days)}
                                disabled={extending}
                                className="text-xs border border-border rounded-lg px-3 py-2 text-left hover:border-accent/60 transition-colors disabled:opacity-50"
                              >
                                <div className="font-semibold text-text-primary">{days} days total</div>
                                <div className="text-muted">{cost > 0 ? formatPaise(cost) : 'Free'}</div>
                              </button>
                            )
                          })}
                        </div>
                        <p className="text-[11px] text-muted">
                          Retention is measured from the original upload, capped at {MAX_EXPIRY_DAYS_FROM_UPLOAD} days for safety.
                        </p>
                        {extendError && (
                          <div className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
                            {extendError}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Inline activity — every download attempt against this link */}
                    {isActivityOpen && (
                      <div className="border-t border-border pt-3 space-y-2">
                        {activityLoading === t.fileId ? (
                          <div className="text-xs text-muted">Loading…</div>
                        ) : !attempts || attempts.length === 0 ? (
                          <div className="text-xs text-muted">No download attempts yet.</div>
                        ) : (
                          attempts.map((a) => (
                            <div key={a.downloadId} className="flex items-center justify-between text-xs">
                              <span className={
                                a.outcome === 'success' ? 'text-success' :
                                a.outcome === 'expired' || a.outcome === 'invalid' ? 'text-danger' : 'text-yellow-500'
                              }>
                                {a.outcome === 'success' ? 'Downloaded' : a.outcome === 'expired' ? 'Blocked — expired' : a.outcome === 'exhausted' ? 'Blocked — link limit reached' : 'Blocked — invalid'}
                                {a.countryCode ? ` · ${a.countryCode}` : ''}
                              </span>
                              <span className="text-muted">
                                {new Date(a.attemptedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Pagination — client-side only, everything's already fetched in one call */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-5 text-sm">
              <span className="text-xs text-muted">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-lg border border-border text-muted hover:text-text-primary hover:border-accent/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <span className="px-2 text-xs text-muted">Page {currentPage} of {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded-lg border border-border text-muted hover:text-text-primary hover:border-accent/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {!loading && !error && tab === 'requests' && (
        <ReceiveRequestsPanel />
      )}

      {!loading && !error && tab === 'trash' && (
        deletedTransfers.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <TrashIcon className="w-8 h-8 text-muted mx-auto" />
            <div className="text-sm text-muted">Trash is empty.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {deletedTransfers.map((t) => (
              <div key={t.fileId} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3 opacity-70">
                <div className={`w-9 h-9 rounded-xl bg-bg flex items-center justify-center flex-shrink-0 ${fileTypeColor(t.fileName, !!t.fileCount)}`}>
                  {t.fileCount ? <PackageIcon className="w-4 h-4" /> : <FileTypeIcon fileName={t.fileName} className="w-4 h-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-text-primary truncate text-sm">{t.displayName ?? t.fileName}</div>
                  <div className="text-xs text-muted mt-0.5">{formatBytes(t.fileSizeBytes)} · Deleted</div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </main>
  )
}
