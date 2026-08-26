'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import UserStatusBadge from '@/components/admin/UserStatusBadge'

interface AdminUser {
  userId: string
  email: string
  name: string
  status?: 'active' | 'warned' | 'blocked'
  createdAt: string
  totalUsageBytes: number
  totalTransfers: number
}

type SortOption = 'newest' | 'oldest' | 'name' | 'usage'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [sortOption, setSortOption] = useState<SortOption>('newest')
  const [loading, setLoading] = useState(true)

  const load = (query: string) => {
    setLoading(true)
    fetch(`/api/admin/users${query ? `?q=${encodeURIComponent(query)}` : ''}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) { setUsers(data.data.users); setTotal(data.data.total) }
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load('') }, [])

  useEffect(() => {
    const t = setTimeout(() => load(q), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const sortedUsers = useMemo(() => {
    const list = [...users]
    list.sort((a, b) => {
      if (sortOption === 'oldest') return a.createdAt.localeCompare(b.createdAt)
      if (sortOption === 'name') return a.name.localeCompare(b.name)
      if (sortOption === 'usage') return b.totalUsageBytes - a.totalUsageBytes
      return b.createdAt.localeCompare(a.createdAt)
    })
    return list
  }, [users, sortOption])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Users</h1>
          <p className="text-sm text-muted mt-0.5">{total.toLocaleString('en-IN')} total</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email…"
            className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60 w-64"
          />
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
            className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/60"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name (A-Z)</option>
            <option value="usage">Usage (largest first)</option>
          </select>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium">Usage</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">Loading…</td></tr>
            ) : sortedUsers.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">No users found</td></tr>
            ) : (
              sortedUsers.map((u) => (
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
                  <td className="px-4 py-3"><UserStatusBadge status={u.status} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
