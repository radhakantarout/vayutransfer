'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import type { StudioRole } from '@/lib/studio/auth'

type Auth = { role: StudioRole; userId: string; studioId?: string; name: string; email: string }

const ROLE_LABEL: Record<StudioRole, string> = {
  OWNER: 'Platform Owner',
  ADMIN: 'Studio Admin',
  CLIENT: 'Client',
  PRINT: 'Print Admin',
}

const MARKETING_LINKS = [
  { label: 'Products',       href: '/studio/home#features' },
  { label: 'Pricing',        href: '/studio/pricing' },
  { label: 'Events',         href: '/studio/events' },
  { label: 'About us',       href: '/studio/about' },
  { label: 'Help & Support', href: '/studio/help' },
]

function HamburgerIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}
function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?'
  return (
    <div className={`rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center font-bold text-accent flex-shrink-0 ${
      size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm'
    }`}>
      {initials}
    </div>
  )
}

export default function StudioNavbar() {
  const [auth, setAuth]             = useState<Auth | null | 'loading'>('loading')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef                  = useRef<HTMLDivElement>(null)
  const router                      = useRouter()
  const pathname                    = usePathname()

  // Read the studio_ui cookie synchronously — set by the login API, cleared by logout.
  // No async fetch needed: instant, no caching issues, always reflects real auth state.
  useEffect(() => {
    const match = document.cookie
      .split('; ')
      .find((c) => c.startsWith('studio_ui='))
    if (match) {
      try {
        const parsed = JSON.parse(decodeURIComponent(match.split('=').slice(1).join('=')))
        setAuth({ role: parsed.role, userId: '', studioId: parsed.studioId ?? '', name: parsed.name ?? '', email: parsed.email ?? '' })
      } catch {
        setAuth(null)
      }
    } else {
      setAuth(null)
    }
  }, [pathname])

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!profileOpen) return
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [profileOpen])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const closeAll = () => { setMobileOpen(false); setProfileOpen(false) }

  const handleLogout = async () => {
    await fetch('/studio/api/auth/logout', { method: 'POST' })
    closeAll()
    setAuth(null)
    router.push('/studio/home')
    router.refresh()
  }

  const isLoggedIn = auth && auth !== 'loading'

  return (
    <>
      {/* ── Top bar ──────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="px-5 h-14 flex items-center justify-between">

          {/* Logo */}
          <Link href="/studio/home" onClick={closeAll} className="flex items-center gap-2 flex-shrink-0">
            <Image src="/logo.png" alt="VayuStudio" width={36} height={36} className="h-9 w-9 flex-shrink-0" />
            <span className="text-lg font-extrabold text-text-primary leading-none">
              Vayu<span className="text-accent">Studio</span>
            </span>
          </Link>

          {/* Desktop centre links */}
          <div className="hidden md:flex items-center gap-7 text-sm">
            {isLoggedIn ? (
              <>
                {(auth as Auth).role === 'OWNER' && (
                  <>
                    <Link href="/studio/admin/studios" className="text-muted hover:text-text-primary transition-colors">Studios</Link>
                    <Link href="/studio/admin/users"   className="text-muted hover:text-text-primary transition-colors">Users</Link>
                  </>
                )}
                {((auth as Auth).role === 'ADMIN' || (auth as Auth).role === 'PRINT') && (
                  <Link href="/studio/dashboard" className="text-muted hover:text-text-primary transition-colors">Dashboard</Link>
                )}
              </>
            ) : (
              MARKETING_LINKS.map(({ label, href }) => (
                <Link key={href} href={href} className="text-muted hover:text-text-primary transition-colors whitespace-nowrap">
                  {label}
                </Link>
              ))
            )}
          </div>

          {/* Desktop right */}
          <div className="hidden md:flex items-center gap-2">
            {auth === 'loading' ? (
              <div className="w-9 h-9 rounded-full bg-border animate-pulse" />
            ) : isLoggedIn ? (
              /* Profile icon + dropdown */
              <div className="relative" ref={profileRef}>
                <button
                  onClick={() => setProfileOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-border/40 transition-colors"
                  aria-label="Profile menu"
                >
                  <Avatar name={(auth as Auth).name || (auth as Auth).email || 'U'} />
                  <svg
                    className={`w-3.5 h-3.5 text-muted transition-transform ${profileOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {profileOpen && (
                  <div className="absolute right-0 top-12 w-64 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden z-50">
                    {/* Profile info */}
                    <div className="px-4 py-4 border-b border-border flex items-center gap-3">
                      <Avatar name={(auth as Auth).name || (auth as Auth).email || 'U'} size="md" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-text-primary truncate">
                          {(auth as Auth).name || 'Studio User'}
                        </div>
                        <div className="text-xs text-muted truncate">{(auth as Auth).email}</div>
                        <span className="inline-block mt-1 text-[10px] font-semibold text-accent bg-accent/10 border border-accent/20 rounded-full px-2 py-0.5">
                          {ROLE_LABEL[(auth as Auth).role]}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="p-2">
                      {((auth as Auth).role === 'ADMIN' || (auth as Auth).role === 'PRINT') && (
                        <Link
                          href="/studio/dashboard"
                          onClick={closeAll}
                          className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm text-text-primary hover:bg-border/50 transition-colors"
                        >
                          <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <rect x="3" y="3" width="7" height="7" rx="1" />
                            <rect x="14" y="3" width="7" height="7" rx="1" />
                            <rect x="3" y="14" width="7" height="7" rx="1" />
                            <rect x="14" y="14" width="7" height="7" rx="1" />
                          </svg>
                          Dashboard
                        </Link>
                      )}
                      {(auth as Auth).role === 'OWNER' && (
                        <Link
                          href="/studio/admin/studios"
                          onClick={closeAll}
                          className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm text-text-primary hover:bg-border/50 transition-colors"
                        >
                          <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3" />
                          </svg>
                          Admin Panel
                        </Link>
                      )}
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm text-danger hover:bg-danger/10 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link
                  href="/studio/login"
                  className="text-sm font-semibold px-4 py-2 rounded-lg border border-border text-text-primary hover:bg-border/40 transition-colors"
                >
                  Login
                </Link>
                <Link
                  href="/studio/home#get-started"
                  className="text-sm font-bold px-4 py-2 rounded-lg bg-accent text-bg hover:bg-accent/90 transition-colors"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg border border-border text-text-primary hover:bg-border/40 transition-colors"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <CloseIcon /> : <HamburgerIcon />}
          </button>
        </div>
      </nav>

      {/* ── Mobile backdrop ───────────────────────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* ── Mobile drawer ─────────────────────────────────────────── */}
      <div
        className={`fixed top-14 left-0 right-0 z-50 md:hidden bg-card border-b border-border shadow-2xl
          transition-all duration-200 ease-out
          ${mobileOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}
      >
        <div className="px-5 pb-6 pt-3">
          {isLoggedIn ? (
            <>
              {/* Profile info strip */}
              <div className="flex items-center gap-3 py-3 mb-2 border-b border-border">
                <Avatar name={(auth as Auth).name || (auth as Auth).email || 'U'} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text-primary truncate">
                    {(auth as Auth).name || 'Studio User'}
                  </div>
                  <div className="text-xs text-muted truncate">{(auth as Auth).email}</div>
                </div>
                <span className="ml-auto text-[10px] font-semibold text-accent bg-accent/10 border border-accent/20 rounded-full px-2 py-0.5 flex-shrink-0">
                  {ROLE_LABEL[(auth as Auth).role]}
                </span>
              </div>

              {(auth as Auth).role === 'OWNER' && (
                <>
                  <Link href="/studio/admin/studios" onClick={closeAll}
                    className="flex items-center justify-between py-3.5 text-base font-medium text-text-primary border-b border-border/40 hover:text-accent transition-colors">
                    Studios <span className="text-muted text-sm">→</span>
                  </Link>
                  <Link href="/studio/admin/users" onClick={closeAll}
                    className="flex items-center justify-between py-3.5 text-base font-medium text-text-primary border-b border-border/40 hover:text-accent transition-colors">
                    Users <span className="text-muted text-sm">→</span>
                  </Link>
                </>
              )}
              {((auth as Auth).role === 'ADMIN' || (auth as Auth).role === 'PRINT') && (
                <Link href="/studio/dashboard" onClick={closeAll}
                  className="flex items-center justify-between py-3.5 text-base font-medium text-text-primary border-b border-border/40 hover:text-accent transition-colors">
                  Dashboard <span className="text-muted text-sm">→</span>
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="mt-4 w-full text-center py-3 rounded-xl border border-danger/30 text-danger text-sm font-semibold hover:bg-danger/10 transition-colors"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              {MARKETING_LINKS.map(({ label, href }) => (
                <Link key={href} href={href} onClick={closeAll}
                  className="flex items-center justify-between py-3.5 text-base font-medium text-text-primary border-b border-border/40 last:border-0 hover:text-accent transition-colors">
                  {label}
                  <span className="text-muted text-sm">→</span>
                </Link>
              ))}
              <div className="grid grid-cols-2 gap-3 mt-5">
                <Link href="/studio/login" onClick={closeAll}
                  className="py-3 rounded-xl border border-border text-text-primary text-sm font-semibold text-center hover:bg-border/40 transition-colors">
                  Login
                </Link>
                <Link href="/studio/home#get-started" onClick={closeAll}
                  className="py-3 rounded-xl bg-accent text-bg text-sm font-bold text-center hover:bg-accent/90 transition-colors">
                  Get Started
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
