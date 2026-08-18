'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { formatPaise } from '@/lib/pricing'
import type { DashboardUsage } from '@/app/api/dashboard/usage/route'

function fmtBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

const EVENT_LABEL: Record<string, string> = {
  UPLOAD_INITIATED: 'Upload started',
  UPLOAD_COMPLETED: 'Upload completed',
  UPLOAD_FAILED: 'Upload failed',
  UPLOAD_EXPIRED_PENDING: 'Upload expired',
  DOWNLOAD_ATTEMPTED: 'Download attempted',
  DOWNLOAD_SUCCESS: 'File downloaded',
  DOWNLOAD_BLOCKED_EXPIRED: 'Download blocked — link expired',
  DOWNLOAD_BLOCKED_EXHAUSTED: 'Download blocked — slots used up',
  DOWNLOAD_BLOCKED_INVALID: 'Download blocked — invalid link',
  LINK_EXPIRED: 'Link expired',
  LINK_EXHAUSTED: 'Link exhausted',
  RATE_LIMIT_HIT: 'Rate limit hit',
  SLOTS_ADDED: 'Download slots added',
  EXPIRY_EXTENDED: 'Link expiry extended',
  WALLET_TOPUP_SUCCESS: 'Wallet topped up',
  WALLET_REFUNDED: 'Wallet refunded',
}

const OUTCOME_COLOR: Record<string, string> = {
  success: 'text-success',
  failure: 'text-danger',
  warning: 'text-yellow-500',
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl px-5 py-4 space-y-1">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-2xl font-bold text-text-primary">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  )
}

export default function DashboardPage() {
  const { status } = useSession()
  const router = useRouter()
  const [usage, setUsage] = useState<DashboardUsage | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/dashboard/usage')
      .then((r) => r.json())
      .then((data) => { if (data.success) setUsage(data.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [status])

  if (status === 'loading' || status === 'unauthenticated') {
    return <div className="min-h-[calc(100vh-56px)] bg-bg" />
  }

  const maxDayBytes = usage ? Math.max(1, ...usage.dailySeries.map((d) => d.bytes)) : 1

  return (
    <div className="min-h-[calc(100vh-56px)] bg-bg">
      <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Recent Activity</h1>
          <p className="text-sm text-muted mt-0.5">Your storage usage and transfer history</p>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-card border border-border rounded-2xl animate-pulse" />)}
          </div>
        ) : !usage ? (
          <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted text-sm">
            Couldn&apos;t load your dashboard — try again shortly.
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Total Storage" value={fmtBytes(usage.totalStorageBytes)} sub="currently active" />
              <StatCard label="This Month" value={fmtBytes(usage.monthlyStorageBytes)} />
              <StatCard label="Today" value={fmtBytes(usage.dailyStorageBytes)} />
              <StatCard label="Total Transfers" value={String(usage.totalTransfers)} sub={`${usage.totalDownloads} downloads · ${formatPaise(usage.totalSpentPaise)} spent`} />
            </div>

            {/* Daily usage chart */}
            <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-text-primary">Storage uploaded — last 30 days</h2>
              <div className="flex items-end gap-1 h-32">
                {usage.dailySeries.map((d) => (
                  <div key={d.date} className="flex-1 group relative">
                    <div
                      className="w-full bg-accent/70 hover:bg-accent rounded-t transition-colors"
                      style={{ height: `${Math.max(2, (d.bytes / maxDayBytes) * 100)}%` }}
                    />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-nav text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                      {new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {fmtBytes(d.bytes)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent activity */}
            <div>
              <h2 className="font-semibold text-text-primary mb-4">Recent Activity</h2>
              {usage.recentActivity.length === 0 ? (
                <div className="bg-card border border-border rounded-xl p-8 text-center text-muted text-sm">
                  No activity yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {usage.recentActivity.map((e) => (
                    <div key={e.auditId} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <div className={`text-sm font-medium ${OUTCOME_COLOR[e.outcome] ?? 'text-text-primary'}`}>
                          {EVENT_LABEL[e.eventType] ?? e.eventType}
                        </div>
                        <div className="text-xs text-muted">
                          {new Date(e.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}
                        </div>
                      </div>
                      {e.amountPaise != null && e.amountPaise !== 0 && (
                        <div className="text-sm font-semibold text-text-primary flex-shrink-0">{formatPaise(e.amountPaise)}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
