'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import NotificationsPanel from '@/components/studio/moments/NotificationsPanel'
import ProfilePanel from '@/components/studio/moments/ProfilePanel'

// Fixed top bar — logo left, Notifications/Profile right — identical on
// every Moments page (landing, search, new, standalone notifications/
// profile pages, and inside a gallery, which used to have its own
// different back-chevron header). Fully self-contained (own pending-count
// fetch, own popup state) so every page just drops in `<TopNavBar />` with
// no props, keeping this one place as the only entry point for those two
// actions — the bottom bar no longer duplicates them.
export default function TopNavBar() {
  const [pendingCount, setPendingCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  useEffect(() => {
    fetch('/studio/api/moments/notifications')
      .then((r) => r.json())
      .then((res) => { if (res.success) setPendingCount(res.data.totalPending) })
      .catch(() => {})
  }, [])

  return (
    <>
      <header className="fixed top-0 inset-x-0 md:left-20 lg:left-56 z-40 h-14 sm:h-16 flex items-center justify-between px-4 sm:px-6 bg-card/95 backdrop-blur border-b border-border">
        <Link href="/studio/moments" className="flex items-center gap-2 min-w-0">
          <Image src="/logo.png" alt="VayuStudios" width={26} height={26} className="h-6 w-6 sm:h-7 sm:w-7 flex-shrink-0" />
          <span className="text-sm font-extrabold text-text-primary truncate">
            Vayu<span className="text-accent">Studios</span> <span className="text-muted font-semibold">Moments</span>
          </span>
        </Link>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowNotifications(true)}
            aria-label="Notifications"
            className="relative w-9 h-9 flex items-center justify-center rounded-lg border border-border text-muted hover:text-text-primary transition-colors"
          >
            <svg className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.311 6.022c1.733.64 3.56 1.085 5.454 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
            {!!pendingCount && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowProfile(true)}
            aria-label="Profile"
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-muted hover:text-text-primary transition-colors"
          >
            <svg className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      {showNotifications && (
        <div className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center" onClick={() => setShowNotifications(false)}>
          <div className="bg-card border-t sm:border border-border rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div>
                <h2 className="text-sm font-bold text-text-primary">Notifications</h2>
                <p className="text-xs text-muted">Join requests waiting on you</p>
              </div>
              <button onClick={() => setShowNotifications(false)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-border/60 text-muted">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <NotificationsPanel enableAuthRedirect={false} onPendingCountChange={setPendingCount} onModal />
            </div>
          </div>
        </div>
      )}

      {showProfile && (
        <div className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center" onClick={() => setShowProfile(false)}>
          <div className="bg-card border-t sm:border border-border rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <h2 className="text-sm font-bold text-text-primary">Profile</h2>
              <button onClick={() => setShowProfile(false)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-border/60 text-muted">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <ProfilePanel innerBg="bg" />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
