'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import MomentsBottomNav from '@/components/studio/moments/BottomNav'

interface MomentsEvent {
  projectId: string
  clientName: string
  coverPhotoUrl?: string | null
}

export default function MomentsSearchPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [events, setEvents] = useState<MomentsEvent[] | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    fetch('/studio/api/auth/me')
      .then((r) => r.json())
      .then((res) => {
        if (!res.success || !res.data || res.data.role !== 'CLIENT') {
          router.replace('/studio/login?next=/studio/moments/search')
          return
        }
        return fetch('/studio/api/moments/events').then((r) => r.json()).then((eventsRes) => setEvents(eventsRes.success ? eventsRes.data : []))
      })
      .catch(() => router.replace('/studio/login?next=/studio/moments/search'))
      .finally(() => setChecking(false))
  }, [router])

  const filtered = (events ?? []).filter((e) => e.clientName.toLowerCase().includes(query.trim().toLowerCase()))

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg pb-24 md:pb-0 md:pl-20 lg:pl-56">
      <header className="px-5 sm:px-8 py-6 space-y-4">
        <h1 className="text-xl sm:text-2xl font-extrabold text-text-primary">Search your galleries</h1>
        <div className="relative max-w-md">
          <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Priya & Rahul's Wedding"
            className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent"
          />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8">
        {!events ? (
          <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted text-center py-16">{query ? 'No galleries match that name.' : 'Start typing to search.'}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map((ev) => (
              <Link
                key={ev.projectId}
                href={`/studio/moments/${ev.projectId}`}
                className="flex items-center gap-3 bg-card border border-border rounded-2xl p-3 hover:border-accent/40 transition-colors"
              >
                <div className="w-12 h-12 rounded-xl bg-card-2 flex-shrink-0 overflow-hidden flex items-center justify-center text-lg" style={!ev.coverPhotoUrl ? { background: 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)' } : undefined}>
                  {ev.coverPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ev.coverPhotoUrl} alt="" className="w-full h-full object-cover" />
                  ) : '🎉'}
                </div>
                <span className="text-sm font-bold text-text-primary truncate">{ev.clientName}</span>
              </Link>
            ))}
          </div>
        )}
      </main>

      <MomentsBottomNav />
    </div>
  )
}
