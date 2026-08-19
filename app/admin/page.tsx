'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import StatCard from '@/components/admin/StatCard'
import { UsersIcon, PackageIcon, DownloadIcon, WalletIcon, RefreshIcon, InboxIcon } from '@/components/icons'

interface Stats {
  totalUsers: number
  totalItemsTransferred: number
  totalItemsReceived: number
  totalWalletBalancePaise: number
  totalRevenuePaise: number
  storage: { totalObjects: number; totalBytes: number; lastSyncedAt: string } | null
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(2)} TB`
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${bytes} B`
}

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const load = () => {
    fetch('/api/admin/stats')
      .then((r) => r.json())
      .then((data) => { if (data.success) setStats(data.data) })
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const syncNow = async () => {
    setSyncing(true)
    try {
      await fetch('/api/admin/r2-sync', { method: 'POST' })
      load()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Overview</h1>
        <p className="text-sm text-muted mt-0.5">Platform activity and performance</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : stats && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard label="Total Users" value={stats.totalUsers.toLocaleString('en-IN')} icon={<UsersIcon className="w-4 h-4" />} />
            <StatCard
              label="Total Storage Used"
              value={stats.storage ? formatBytes(stats.storage.totalBytes) : 'Not synced yet'}
              sub={stats.storage ? `${stats.storage.totalObjects.toLocaleString('en-IN')} objects · synced ${timeAgo(stats.storage.lastSyncedAt)}` : 'Click Sync Now below'}
              icon={<PackageIcon className="w-4 h-4" />}
            />
            <StatCard label="Total Items Transferred" value={stats.totalItemsTransferred.toLocaleString('en-IN')} icon={<InboxIcon className="w-4 h-4" />} />
            <StatCard label="Total Items Received" value={stats.totalItemsReceived.toLocaleString('en-IN')} icon={<DownloadIcon className="w-4 h-4" />} />
            <StatCard label="Total Wallet Balance" value={formatPaise(stats.totalWalletBalancePaise)} sub="Across every user" icon={<WalletIcon className="w-4 h-4" />} />
            <StatCard label="Total Revenue" value={formatPaise(stats.totalRevenuePaise)} sub="Successful wallet top-ups" icon={<WalletIcon className="w-4 h-4" />} />
          </div>

          <div className="bg-card border border-border rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm font-semibold text-text-primary">R2 Bucket Status</div>
              <div className="text-xs text-muted mt-0.5">
                {stats.storage
                  ? `${stats.storage.totalObjects.toLocaleString('en-IN')} objects · ${formatBytes(stats.storage.totalBytes)} · last synced ${timeAgo(stats.storage.lastSyncedAt)}`
                  : 'Storage stats have never been synced.'}
              </div>
            </div>
            <button
              onClick={syncNow}
              disabled={syncing}
              className="flex items-center gap-1.5 bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              <RefreshIcon className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-text-primary">Users</div>
              <Link href="/admin/users" className="text-xs font-semibold text-accent hover:underline">View all →</Link>
            </div>
            <p className="text-xs text-muted">Search, drill into wallet/transfer history, and block/warn/unblock accounts from the Users page.</p>
          </div>
        </>
      )}
    </div>
  )
}
