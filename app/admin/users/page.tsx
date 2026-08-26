'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import UserStatusBadge from '@/components/admin/UserStatusBadge'
import { ChevronDownIcon } from '@/components/icons'

interface AdminUser {
  userId: string
  email: string
  name: string
  status?: 'active' | 'warned' | 'blocked'
  createdAt: string
  totalUsageBytes: number
  totalTransfers: number
  r2UsageBytes: number | null
}

type SortKey = 'name' | 'email' | 'createdAt' | 'activeUsage' | 'r2Usage' | 'status'
type SortDir = 'asc' | 'desc'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [r2SyncedAt, setR2SyncedAt] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('createdAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [loading, setLoading] = useState(true)

  const load = (query: string) => {
    setLoading(true)
    fetch(`/api/admin/users${query ? `?q=${encodeURIComponent(query)}` : ''}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) { setUsers(data.data.users); setTotal(data.data.total); setR2SyncedAt(data.data.r2SyncedAt) }
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load('') }, [])

  useEffect(() => {
    const t = setTimeout(() => load(q), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'name' || key === 'email' || key === 'status' ? 'asc' : 'desc')
    }
  }

  const sortedUsers = useMemo(() => {
    const list = [...users]
    const dir = sortDir === 'asc' ? 1 : -1
    list.sort((a, b) => {
      switch (sortKey) {
        case 'name': return dir * a.name.localeCompare(b.name)
        case 'email': return dir * a.email.localeCompare(b.email)
        case 'status': return dir * (a.status ?? 'active').localeCompare(b.status ?? 'active')
        case 'activeUsage': return dir * (a.totalUsageBytes - b.totalUsageBytes)
        case 'r2Usage': return dir * ((a.r2UsageBytes ?? -1) - (b.r2UsageBytes ?? -1))
        default: return dir * a.createdAt.localeCompare(b.createdAt)
      }
    })
    return list
  }, [users, sortKey, sortDir])

  const SortableHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => {
    const active = sortKey === sortKeyName
    return (
      <th className="px-4 py-3 font-medium">
        <button
          onClick={() => toggleSort(sortKeyName)}
          className={`flex items-center gap-1 hover:text-text-primary transition-colors ${active ? 'text-text-primary' : ''}`}
        >
          {label}
          <ChevronDownIcon
            className={`w-3 h-3 transition-transform ${active ? 'opacity-100' : 'opacity-30'} ${active && sortDir === 'asc' ? 'rotate-180' : ''}`}
          />
        </button>
      </th>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Users</h1>
          <p className="text-sm text-muted mt-0.5">
            {total.toLocaleString('en-IN')} total
            {r2SyncedAt && ` · R2 usage synced ${timeAgo(r2SyncedAt)}`}
            {!r2SyncedAt && ' · R2 usage not synced yet (see Overview)'}
          </p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or email…"
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60 w-64"
        />
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <SortableHeader label="User" sortKeyName="name" />
              <SortableHeader label="Email" sortKeyName="email" />
              <SortableHeader label="Joined" sortKeyName="createdAt" />
              <SortableHeader label="Active Usage" sortKeyName="activeUsage" />
              <SortableHeader label="R2 Usage" sortKeyName="r2Usage" />
              <SortableHeader label="Status" sortKeyName="status" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">Loading…</td></tr>
            ) : sortedUsers.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">No users found</td></tr>
            ) : (
              sortedUsers.map((u) => {
                const gap = u.r2UsageBytes !== null ? u.r2UsageBytes - u.totalUsageBytes : null
                const hasGap = gap !== null && gap > 5 * 1024 * 1024
                return (
                  <tr key={u.userId} className="border-b border-border last:border-0 hover:bg-border/20 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${u.userId}`} className="font-medium text-text-primary hover:text-accent transition-colors">
                        {u.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{u.email}</td>
                    <td className="px-4 py-3 text-muted">{new Date(u.createdAt).toLocaleDateString('en-IN')}</td>
                    <td className="px-4 py-3">
                      <div className="text-text-primary font-medium tabular-nums">{formatBytes(u.totalUsageBytes)}</div>
                      <div className="text-[11px] text-muted">{u.totalTransfers} transfer{u.totalTransfers !== 1 ? 's' : ''}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`font-medium tabular-nums ${hasGap ? 'text-yellow-500' : 'text-text-primary'}`}>
                        {u.r2UsageBytes !== null ? formatBytes(u.r2UsageBytes) : '—'}
                      </div>
                      {hasGap && <div className="text-[11px] text-yellow-500">+{formatBytes(gap!)} unaccounted</div>}
                    </td>
                    <td className="px-4 py-3"><UserStatusBadge status={u.status} /></td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
