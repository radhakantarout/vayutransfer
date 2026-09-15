'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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

// Just the pending-requests list — no page chrome — shared by the standalone
// /studio/moments/notifications page and the gallery header's Notifications
// popup. `enableAuthRedirect` is skipped in the popup case since being
// inside a gallery already proves the viewer is a signed-in CLIENT.
// `onPendingCountChange` should be a stable setState function (not a fresh
// inline arrow) — it's a dependency of the fetch callback below. `onModal`
// flips the two nesting-level backgrounds so cards still contrast with
// whichever surface sits behind them: the plain page (bg-bg) wants
// bg-card/bg-bg nesting, a bg-card modal sheet wants it the other way round.
export default function NotificationsPanel({
  enableAuthRedirect = true,
  onPendingCountChange,
  onModal = false,
}: {
  enableAuthRedirect?: boolean
  onPendingCountChange?: (n: number) => void
  onModal?: boolean
}) {
  const router = useRouter()
  const [checking, setChecking] = useState(enableAuthRedirect)
  const [galleries, setGalleries] = useState<GalleryPending[] | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/studio/api/moments/notifications')
      .then((r) => r.json())
      .then((res) => {
        const list: GalleryPending[] = res.success ? res.data.galleries : []
        setGalleries(list)
        onPendingCountChange?.(list.reduce((s, g) => s + g.pendingCount, 0))
      })
      .catch(() => setGalleries([]))
  }, [onPendingCountChange])

  useEffect(() => {
    if (!enableAuthRedirect) { load(); return }
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
  }, [router, load, enableAuthRedirect])

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
      <div className="flex justify-center py-10">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const outerCard = onModal ? 'bg-bg' : 'bg-card'
  const innerCard = onModal ? 'bg-card' : 'bg-bg'

  return (
    <div className="space-y-4">
      {!galleries ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
      ) : galleries.length === 0 ? (
        <div className="border border-dashed border-border rounded-2xl py-14 flex flex-col items-center justify-center gap-3 text-center px-5">
          <div className="text-3xl">🔔</div>
          <p className="text-sm font-semibold text-text-primary">All caught up</p>
          <p className="text-xs text-muted max-w-xs">No pending join requests right now.</p>
        </div>
      ) : (
        galleries.map((g) => (
          <div key={g.projectId} className={`${outerCard} border border-border rounded-2xl p-4 space-y-3`}>
            <Link href={`/studio/moments/${g.projectId}`} className="text-sm font-bold text-text-primary hover:underline">
              {g.eventName}
            </Link>
            {g.pending.map((p) => (
              <div key={p.userId} className={`flex items-center justify-between gap-2 ${innerCard} border border-border rounded-2xl px-3 py-2.5`}>
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
    </div>
  )
}
