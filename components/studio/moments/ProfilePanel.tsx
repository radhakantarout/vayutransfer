'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useMomentsTheme } from '@/lib/momentsTheme'

interface Me {
  name: string
  email: string
}

const GRADIENT = 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)'

// Just the account card + sign out — no page chrome (header/bottom nav) —
// so it can be dropped into the standalone /studio/moments/profile page AND
// the gallery header's Profile popup without duplicating the fetch/logout
// logic in two places. `innerBg` picks the inner cards' background so they
// contrast with whichever surface this panel is dropped onto: the plain
// page (bg-bg) wants bg-card cards; a bg-card modal sheet wants bg-bg ones.
export default function ProfilePanel({ innerBg = 'card' }: { innerBg?: 'card' | 'bg' }) {
  const router = useRouter()
  const { theme, toggle: toggleTheme } = useMomentsTheme()
  const [me, setMe] = useState<Me | null>(null)
  const [checking, setChecking] = useState(true)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    fetch('/studio/api/auth/me')
      .then((r) => r.json())
      .then((res) => {
        if (!res.success || !res.data || res.data.role !== 'CLIENT') {
          router.replace('/studio/login?next=/studio/moments/profile')
          return
        }
        setMe(res.data)
      })
      .catch(() => router.replace('/studio/login?next=/studio/moments/profile'))
      .finally(() => setChecking(false))
  }, [router])

  const handleLogout = async () => {
    setSigningOut(true)
    await fetch('/studio/api/auth/logout', { method: 'POST' })
    router.replace('/studio/login')
  }

  if (checking || !me) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const initials = (me.name || me.email || '?').split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
  const cardClass = innerBg === 'bg' ? 'bg-bg' : 'bg-card'

  return (
    <div className="space-y-4">
      <div className={`flex items-center gap-4 ${cardClass} border border-border rounded-2xl p-5`}>
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-extrabold flex-shrink-0 animate-reel-float"
          style={{ background: GRADIENT }}
        >
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-base font-bold text-text-primary truncate">{me.name || 'Your account'}</p>
          <p className="text-xs text-muted truncate">{me.email}</p>
        </div>
      </div>

      <div className={`flex items-center gap-3 ${cardClass} border border-border rounded-2xl p-4`}>
        <button
          type="button" role="switch" aria-checked={theme === 'dark'}
          onClick={toggleTheme}
          className={`relative flex-shrink-0 rounded-full transition-colors ${theme === 'dark' ? 'bg-accent' : 'bg-border'}`}
          style={{ height: '22px', width: '38px' }}
        >
          <span className={`absolute top-0.5 left-0.5 rounded-full bg-white transition-transform ${theme === 'dark' ? 'translate-x-4' : 'translate-x-0'}`} style={{ height: '18px', width: '18px' }} />
        </button>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-text-primary">Dark mode</p>
          <p className="text-[11px] text-muted">Moments looks best in the dark — switch back to light anytime</p>
        </div>
      </div>

      <div className={`${cardClass} border border-border rounded-2xl p-4 space-y-1 text-xs text-muted leading-relaxed`}>
        <p>✨ VayuStudios Moments — free galleries, kept for 19 days from creation.</p>
      </div>

      <button
        onClick={handleLogout}
        disabled={signingOut}
        className="w-full border border-danger/30 text-danger text-sm font-bold py-3 rounded-xl hover:bg-danger/10 transition-colors disabled:opacity-50"
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  )
}
