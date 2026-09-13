'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import MomentsBottomNav from '@/components/studio/moments/BottomNav'

interface Me {
  name: string
  email: string
}

const GRADIENT = 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)'

export default function MomentsProfilePage() {
  const router = useRouter()
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
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    )
  }

  const initials = (me.name || me.email || '?').split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="min-h-screen bg-bg pb-24 md:pb-0 md:pl-20 lg:pl-56">
      <header className="px-5 sm:px-8 py-6">
        <h1 className="text-xl sm:text-2xl font-extrabold text-text-primary">Profile</h1>
      </header>

      <main className="max-w-md mx-auto px-5 sm:px-8 space-y-6">
        <div className="flex items-center gap-4 bg-card border border-border rounded-2xl p-5">
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

        <div className="bg-card border border-border rounded-2xl p-4 space-y-1 text-xs text-muted leading-relaxed">
          <p>✨ VayuStudios Moments — free galleries, kept for 19 days from creation.</p>
        </div>

        <button
          onClick={handleLogout}
          disabled={signingOut}
          className="w-full border border-danger/30 text-danger text-sm font-bold py-3 rounded-xl hover:bg-danger/10 transition-colors disabled:opacity-50"
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </main>

      <MomentsBottomNav />
    </div>
  )
}
