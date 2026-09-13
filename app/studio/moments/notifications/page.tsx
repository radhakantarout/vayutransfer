'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import MomentsBottomNav from '@/components/studio/moments/BottomNav'

interface PendingPerson {
  userId: string
  name: string
  createdAt: string
}
interface GalleryPending {
  projectId: string
  eventName: string
  pendingCount: number
  pending: PendingPerson[]
}

const AVATAR_TINTS = ['linear-gradient(135deg,#f97316,#ec4899)', 'linear-gradient(135deg,#3b82f6,#8b5cf6)', 'linear-gradient(135deg,#8b5cf6,#ec4899)', 'linear-gradient(135deg,#10b981,#3b82f6)']

function Avatar({ label }: { label: string }) {
  const parts = label.trim().split(/\s+/)
  const letters = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: AVATAR_TINTS[hash % AVATAR_TINTS.length] }}>
      {letters}
    </div>
  )
}

export default function MomentsNotificationsPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [galleries, setGalleries] = useState<GalleryPending[] | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/studio/api/moments/notifications')
      .then((r) => r.json())
      .then((res) => setGalleries(res.success ? res.data.galleries : []))
      .catch(() => setGalleries([]))
  }, [])

  useEffect(() => {
    fetch('/studio/api/auth/me')
      .then((r) => r.json())
      .then((res) => {
        if (!res.success || !res.data || res.data.role !== 'CLIENT') {
          router.replace('/studio/login?next=/studio/moments/notifications')
          return
        }
        load()
      })
      .catch(() => router.replace('/studio/login?next=/studio/moments/notifications'))
      .finally(() => setChecking(false))
  }, [router, load])

  const respond = async (projectId: string, userId: string, action: 'approve' | 'reject') => {
    setBusyKey(`${projectId}:${userId}`)
    try {
      const res = await fetch(`/studio/api/moments/events/${projectId}/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      }).then((r) => r.json())
      if (res.success) load()
    } finally {
      setBusyKey(null)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg pb-24 md:pb-0 md:pl-20 lg:pl-56">
      <header className="px-5 sm:px-8 py-6">
        <h1 className="text-xl sm:text-2xl font-extrabold text-text-primary">Notifications</h1>
        <p className="text-sm text-muted">Join requests waiting on you</p>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8 space-y-4">
        {!galleries ? (
          <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
        ) : galleries.length === 0 ? (
          <div className="border border-dashed border-border rounded-2xl py-16 flex flex-col items-center justify-center gap-3 text-center px-5">
            <div className="text-3xl">🔔</div>
            <p className="text-sm font-semibold text-text-primary">All caught up</p>
            <p className="text-xs text-muted max-w-xs">No pending join requests right now.</p>
          </div>
        ) : (
          galleries.map((g) => (
            <div key={g.projectId} className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <Link href={`/studio/moments/${g.projectId}`} className="text-sm font-bold text-text-primary hover:underline">
                {g.eventName}
              </Link>
              {g.pending.map((p) => (
                <div key={p.userId} className="flex items-center justify-between gap-2 bg-bg border border-border rounded-2xl px-3 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar label={p.name} />
                    <span className="text-sm text-text-primary truncate">{p.name} wants to join</span>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => respond(g.projectId, p.userId, 'approve')}
                      disabled={busyKey === `${g.projectId}:${p.userId}`}
                      className="text-[11px] font-bold px-3 py-1.5 rounded-lg text-white bg-success disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => respond(g.projectId, p.userId, 'reject')}
                      disabled={busyKey === `${g.projectId}:${p.userId}`}
                      className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-border text-muted disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </main>

      <MomentsBottomNav pendingCount={galleries?.reduce((s, g) => s + g.pendingCount, 0) ?? 0} />
    </div>
  )
}
