'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import type { StudioRole } from '@/lib/studio/auth'

type Auth = { role: StudioRole; userId: string; studioId?: string }

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

export default function StudioNavbar() {
  const [auth, setAuth]             = useState<Auth | null | 'loading'>('loading')
  const [mobileOpen, setMobileOpen] = useState(false)
  const router                      = useRouter()

  useEffect(() => {
    fetch('/studio/api/auth/me')
      .then((r) => r.json())
      .then((d) => setAuth(d.data ?? null))
      .catch(() => setAuth(null))
  }, [])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const closeAll = () => setMobileOpen(false)

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
                {(auth as Auth).role === 'ADMIN' && (
                  <Link href="/studio/dashboard" className="text-muted hover:text-text-primary transition-colors">Dashboard</Link>
                )}
                {(auth as Auth).role === 'PRINT' && (
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
              <div className="w-28 h-8 bg-border rounded-lg animate-pulse" />
            ) : isLoggedIn ? (
              <>
                <span className="text-xs font-medium text-accent bg-accent/10 border border-accent/20 rounded-full px-3 py-1">
                  {ROLE_LABEL[(auth as Auth).role]}
                </span>
                <button
                  onClick={handleLogout}
                  className="text-sm text-muted hover:text-danger transition-colors px-3 py-1.5 rounded-lg hover:bg-danger/10"
                >
                  Sign out
                </button>
              </>
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
              <div className="py-3 mb-2 border-b border-border">
                <span className="text-xs font-semibold text-accent bg-accent/10 border border-accent/20 rounded-full px-3 py-1">
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
