'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

interface Me {
  role: string
  name: string
  email: string
}

interface MomentsEvent {
  projectId: string
  clientName: string
  updatedAt: string
}

const WELCOME_CARDS = [
  { emoji: '🎉', title: 'Create a quick event', body: 'Name it, and you\'re ready to add photos & videos in seconds.', gradient: 'linear-gradient(135deg,#f97316,#ec4899)' },
  { emoji: '👨‍👩‍👧‍👦', title: 'Invite your people', body: 'Share one link — friends & family join with a tap, no app needed.', gradient: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' },
  { emoji: '🎬', title: 'Turn it into a Reel', body: 'Pick your favorite photos and get an AI-animated highlight video.', gradient: 'linear-gradient(135deg,#8b5cf6,#ec4899)' },
]

export default function MomentsLandingPage() {
  const router = useRouter()
  const [me, setMe]         = useState<Me | null>(null)
  const [events, setEvents] = useState<MomentsEvent[] | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    fetch('/studio/api/auth/me')
      .then((r) => r.json())
      .then((res) => {
        if (!res.success || !res.data || res.data.role !== 'CLIENT') {
          router.replace('/studio/login?next=/studio/moments')
          return
        }
        setMe(res.data)
        return fetch('/studio/api/moments/events')
          .then((r) => r.json())
          .then((eventsRes) => setEvents(eventsRes.success ? eventsRes.data : []))
      })
      .catch(() => router.replace('/studio/login?next=/studio/moments'))
      .finally(() => setChecking(false))
  }, [router])

  const handleLogout = async () => {
    await fetch('/studio/api/auth/logout', { method: 'POST' })
    router.replace('/studio/login')
  }

  if (checking || !me) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    )
  }

  const firstName = me.name?.split(' ')[0] || 'there'
  const hasEvents = !!events && events.length > 0

  return (
    <div className="min-h-screen bg-bg">
      <header className="flex items-center justify-between px-5 sm:px-8 py-4 border-b border-border">
        <Link href="/studio/moments" className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="VayuStudios" width={28} height={28} className="h-7 w-7" />
          <span className="text-sm font-extrabold text-text-primary">
            Vayu<span className="text-accent">Studios</span> <span className="text-muted font-semibold">Moments</span>
          </span>
        </Link>
        {/* Burger nav placeholder — a real mobile nav (profile, settings) lands with Phase 6's mobile polish pass */}
        <button
          onClick={handleLogout}
          className="text-xs font-semibold text-muted hover:text-text-primary transition-colors px-3 py-1.5 rounded-lg border border-border"
        >
          Sign out
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-5 sm:px-8 py-8 sm:py-16 space-y-8 sm:space-y-10">
        {hasEvents ? (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-text-primary">Hey, {firstName} 👋</h1>
                <p className="text-sm text-muted">Your galleries</p>
              </div>
              <Link
                href="/studio/moments/new"
                className="text-sm font-bold px-4 py-2.5 rounded-xl text-bg text-center"
                style={{ background: 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)' }}
              >
                + New event
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {events!.map((ev, i) => (
                <Link
                  key={ev.projectId}
                  href={`/studio/moments/${ev.projectId}`}
                  className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 space-y-2 hover:border-accent/40 transition-colors animate-reel-pop-in"
                  style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'backwards' }}
                >
                  <div className="text-2xl">🎉</div>
                  <p className="text-sm font-bold text-text-primary truncate">{ev.clientName}</p>
                  <p className="text-xs text-muted">Tap to open</p>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="text-center space-y-3">
              <div
                className="inline-flex w-16 h-16 rounded-2xl items-center justify-center text-3xl animate-reel-float"
                style={{ background: 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)' }}
              >
                👋
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary">
                Welcome, {firstName}!
              </h1>
              <p className="text-sm sm:text-base text-muted max-w-md mx-auto">
                This is your space for sharing moments with the people who matter — weddings, trips, birthdays, anything worth keeping together.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              {WELCOME_CARDS.map((card, i) => (
                <div
                  key={card.title}
                  className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 space-y-2 animate-reel-pop-in"
                  style={{ animationDelay: `${i * 120}ms`, animationFillMode: 'backwards' }}
                >
                  <div
                    className="absolute inset-0 opacity-[0.08] pointer-events-none"
                    style={{ background: card.gradient }}
                  />
                  <div className="relative text-2xl">{card.emoji}</div>
                  <p className="relative text-sm font-bold text-text-primary">{card.title}</p>
                  <p className="relative text-xs text-muted leading-relaxed">{card.body}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-center">
              <Link
                href="/studio/moments/new"
                className="w-full sm:w-auto text-center px-8 py-3.5 rounded-2xl font-bold text-sm text-bg"
                style={{ background: 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)' }}
              >
                Create your first event ✨
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
