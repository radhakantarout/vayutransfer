'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import UserStatusBadge from '@/components/admin/UserStatusBadge'

interface AdminUser {
  userId: string
  email: string
  name: string
  status?: 'active' | 'warned' | 'blocked'
  createdAt: string
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Users</h1>
          <p className="text-sm text-muted mt-0.5">{total.toLocaleString('en-IN')} total</p>
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
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-muted">Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-muted">No users found</td></tr>
            ) : (
              users.map((u) => (
                <tr key={u.userId} className="border-b border-border last:border-0 hover:bg-border/20 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${u.userId}`} className="font-medium text-text-primary hover:text-accent transition-colors">
                      {u.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{u.email}</td>
                  <td className="px-4 py-3 text-muted">{new Date(u.createdAt).toLocaleDateString('en-IN')}</td>
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
