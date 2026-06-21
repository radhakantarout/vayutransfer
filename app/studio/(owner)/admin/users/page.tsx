'use client'

import { useEffect, useState } from 'react'
import type { StudioUser, StudioRole } from '@/types/studio'

const ROLES: Array<StudioRole | 'ALL'> = ['ALL', 'ADMIN', 'CLIENT', 'PRINT']

const ROLE_COLOR: Record<string, string> = {
  ADMIN:  'text-accent',
  CLIENT: 'text-yellow-400',
  PRINT:  'text-muted',
  OWNER:  'text-success',
}

export default function OwnerUsersPage() {
  const [users, setUsers]     = useState<StudioUser[]>([])
  const [filter, setFilter]   = useState<StudioRole | 'ALL'>('ALL')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const url = filter === 'ALL'
      ? '/studio/api/owner/users'
      : `/studio/api/owner/users?role=${filter}`
    fetch(url)
      .then((r) => r.json())
      .then((d) => { if (d.success) setUsers(d.data) })
      .finally(() => setLoading(false))
  }, [filter])

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-text-primary">Users</h1>
        <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => setFilter(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === r ? 'bg-accent text-bg' : 'text-muted hover:text-text-primary'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-muted">No users found.</div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.userId} className="bg-card border border-border rounded-2xl px-5 py-4 flex items-center gap-4">
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-accent/10 text-accent font-bold text-sm flex items-center justify-center flex-shrink-0">
                {(u.name || u.email || '?')[0].toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-text-primary">{u.name || '—'}</span>
                  <span className={`text-xs font-semibold ${ROLE_COLOR[u.role] ?? 'text-muted'}`}>
                    {u.role}
                  </span>
                  {u.status === 'SUSPENDED' && (
                    <span className="text-xs text-danger font-semibold">SUSPENDED</span>
                  )}
                </div>
                <div className="text-xs text-muted mt-0.5 flex gap-3 flex-wrap">
                  {u.email && <span>{u.email}</span>}
                  {u.phone && <span>{u.phone}</span>}
                  {u.linkedStudioId && <span>Studio: {u.linkedStudioId.slice(0, 8)}…</span>}
                  {u.lastLoginAt && (
                    <span>Last login {new Date(u.lastLoginAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div className="text-xs text-muted text-center pt-2">{users.length} users shown</div>
        </div>
      )}
    </div>
  )
}
