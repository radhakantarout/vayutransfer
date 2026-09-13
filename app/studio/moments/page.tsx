'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import MomentsBottomNav from '@/components/studio/moments/BottomNav'

const GRADIENT = 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)'

interface Me {
  role: string
  name: string
  email: string
}

interface MomentsEvent {
  projectId: string
  clientName: string
  updatedAt: string
  coverPhotoUrl?: string | null
  memberCount?: number
}

const FEATURES = [
  { emoji: '🎉', title: 'Create a quick event', body: 'Start sharing photos instantly with a shared gallery.', tint: 'linear-gradient(135deg,#f97316,#ec4899)' },
  { emoji: '💌', title: 'Invite your people', body: 'Share access easily via link, QR, or contact list.', tint: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' },
  { emoji: '🎬', title: 'Turn it into a reel', body: 'Compile best moments into a stunning video montage.', tint: 'linear-gradient(135deg,#8b5cf6,#ec4899)' },
]

// No real photography to source (same limitation solved for Reel style
// cards) — a small scattered "photo stack" built from gradient tiles +
// emoji stands in for the mock's polaroid illustration.
function PhotoStack() {
  return (
    <div className="relative w-24 h-24 mx-auto">
      <div className="absolute inset-0 m-auto w-16 h-16 rounded-full blur-2xl opacity-40" style={{ background: GRADIENT }} />
      <div className="absolute left-1 top-3 w-14 h-14 rounded-xl -rotate-12 shadow-lg flex items-center justify-center text-xl" style={{ background: 'linear-gradient(135deg,#fdba74,#f97316)' }}>🎊</div>
      <div className="absolute right-0 top-0 w-14 h-14 rounded-xl rotate-12 shadow-lg flex items-center justify-center text-xl" style={{ background: 'linear-gradient(135deg,#f0abfc,#ec4899)' }}>💜</div>
      <div className="absolute left-5 bottom-0 w-14 h-14 rounded-xl rotate-3 shadow-lg flex items-center justify-center text-xl" style={{ background: 'linear-gradient(135deg,#c4b5fd,#8b5cf6)' }}>📷</div>
    </div>
  )
}

export default function MomentsLandingPage() {
  const router = useRouter()
  const [me, setMe]         = useState<Me | null>(null)
  const [events, setEvents] = useState<MomentsEvent[] | null>(null)
  const [checking, setChecking] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    fetch('/studio/api/auth/me')
      .then((r) => r.json())
      .then((res) => {
        if (!res.success || !res.data || res.data.role !== 'CLIENT') {
          router.replace('/studio/login?next=/studio/moments')
          return
        }
        setMe(res.data)
        fetch('/studio/api/moments/notifications').then((r) => r.json()).then((notifRes) => {
          if (notifRes.success) setPendingCount(notifRes.data.totalPending)
        }).catch(() => {})
        return fetch('/studio/api/moments/events')
          .then((r) => r.json())
          .then((eventsRes) => setEvents(eventsRes.success ? eventsRes.data : []))
      })
      .catch(() => router.replace('/studio/login?next=/studio/moments'))
      .finally(() => setChecking(false))
  }, [router])

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
    <div className="min-h-screen bg-bg pb-24 md:pb-0 md:pl-20 lg:pl-56">
      <header className="flex items-center px-5 sm:px-8 py-4 border-b border-border md:hidden">
        <Link href="/studio/moments" className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="VayuStudios" width={28} height={28} className="h-7 w-7" />
          <span className="text-sm font-extrabold text-text-primary">
            Vayu<span className="text-accent">Studios</span> <span className="text-muted font-semibold">Moments</span>
          </span>
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-5 sm:px-8 py-8 sm:py-16 space-y-8 sm:space-y-10">
        {hasEvents ? (
          <>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-text-primary">My Galleries</h1>
              <p className="text-sm text-muted">Your favourite people, all in one place.</p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {events!.map((ev, i) => (
                <Link
                  key={ev.projectId}
                  href={`/studio/moments/${ev.projectId}`}
                  className="relative overflow-hidden rounded-2xl aspect-[4/5] group animate-reel-pop-in"
                  style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'backwards' }}
                >
                  {ev.coverPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ev.coverPhotoUrl} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-3xl" style={{ background: GRADIENT }}>🎉</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0" />
                  <div className="absolute bottom-0 left-0 right-0 p-3 space-y-1">
                    <p className="text-sm font-bold text-white truncate drop-shadow">{ev.clientName}</p>
                    {!!ev.memberCount && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-white/90 bg-white/15 backdrop-blur px-2 py-0.5 rounded-full">
                        👥 {ev.memberCount} {ev.memberCount === 1 ? 'person' : 'people'}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="text-center space-y-4">
              <PhotoStack />
              <div className="space-y-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary">
                  Welcome to Moments, {firstName} <span aria-hidden>✨</span>
                </h1>
                <p className="text-sm sm:text-base text-muted max-w-sm mx-auto">
                  Let&apos;s make your next moment unforgettable — bring your people together and keep every photo in one private place.
                </p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-3xl p-4 sm:p-5 space-y-1 animate-reel-pop-in" style={{ animationFillMode: 'backwards' }}>
              {FEATURES.map((f) => (
                <div key={f.title} className="flex items-center gap-3.5 py-2.5">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: f.tint }}>
                    {f.emoji}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-text-primary">{f.title}</p>
                    <p className="text-xs text-muted leading-snug">{f.body}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-center">
              <Link
                href="/studio/moments/new"
                className="w-full sm:w-auto text-center px-8 py-3.5 rounded-2xl font-bold text-sm text-white hover:opacity-90 transition-opacity"
                style={{ background: GRADIENT }}
              >
                Create an event <span aria-hidden>↗</span>
              </Link>
            </div>
            <p className="text-center text-[11px] text-muted -mt-6">Private by default <span aria-hidden>🔒</span></p>
          </>
        )}
      </main>

      <MomentsBottomNav pendingCount={pendingCount} />
    </div>
  )
}
