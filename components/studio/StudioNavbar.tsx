'use client'

import { useState, useEffect, useRef } from 'react'
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

const ROLE_REDIRECT: Record<StudioRole, string> = {
  OWNER: '/studio/admin/studios',
  ADMIN: '/studio/dashboard',
  CLIENT: '/studio/home',
  PRINT: '/studio/dashboard',
}

const MARKETING_LINKS = [
  { label: 'Products',      href: '/studio/home#features' },
  { label: 'Pricing',       href: '/studio/pricing' },
  { label: 'Events',        href: '/studio/events' },
  { label: 'About us',      href: '/studio/about' },
  { label: 'Help & Support', href: '/studio/help' },
]

/* ── Hamburger / Close icons ─────────────────────────────────── */
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
  const [auth, setAuth]               = useState<Auth | null | 'loading'>('loading')
  const [mobileOpen, setMobileOpen]   = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [signinRole, setSigninRole]   = useState<'ADMIN' | 'CLIENT'>('ADMIN')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [loginError, setLoginError]   = useState('')
  const [loggingIn, setLoggingIn]     = useState(false)
  const dropdownRef                   = useRef<HTMLDivElement>(null)
  const router                        = useRouter()

  /* Fetch auth state once */
  useEffect(() => {
    fetch('/studio/api/auth/me')
      .then((r) => r.json())
      .then((d) => setAuth(d.data ?? null))
      .catch(() => setAuth(null))
  }, [])

  /* Close desktop sign-in dropdown on outside click */
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  /* Lock body scroll when mobile menu is open */
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const closeAll = () => { setMobileOpen(false); setDropdownOpen(false) }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    setLoggingIn(true)
    try {
      const res  = await fetch('/studio/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        const msg =
          data.error === 'INVALID_CREDENTIALS' ? 'Wrong email or password' :
          data.error === 'ACCOUNT_SUSPENDED'   ? 'Account suspended'       : 'Sign in failed'
        setLoginError(msg)
      } else {
        const role: StudioRole = data.data?.role
        closeAll()
        setAuth({ role, userId: data.data?.userId ?? '', studioId: data.data?.studioId })
        router.push(ROLE_REDIRECT[role] ?? '/studio/home')
        router.refresh()
      }
    } catch {
      setLoginError('Network error — try again')
    } finally {
      setLoggingIn(false)
    }
  }

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
          <Link
            href="/studio/home"
            onClick={closeAll}
            className="flex items-center gap-2 flex-shrink-0"
          >
            <Image src="/logo.png" alt="VayuStudio" width={36} height={36} className="h-9 w-9 flex-shrink-0" />
            <span className="text-lg font-extrabold text-text-primary leading-none">
              Vayu<span className="text-accent">Studio</span>
            </span>
          </Link>

          {/* Desktop centre links */}
          <div className="hidden md:flex items-center gap-7 text-sm">
            {isLoggedIn ? (
              /* Logged-in: role-based links */
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
              </>
            ) : (
              /* Not logged in: marketing links */
              MARKETING_LINKS.map(({ label, href }) => (
                <Link key={href} href={href} className="text-muted hover:text-text-primary transition-colors whitespace-nowrap">
                  {label}
                </Link>
              ))
            )}
          </div>

          {/* Desktop right — auth controls */}
          <div className="hidden md:flex items-center gap-2">
            {auth === 'loading' ? (
              <div className="w-28 h-8 bg-border rounded-lg animate-pulse" />
            ) : isLoggedIn ? (
              /* Logged in */
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
              /* Not logged in — Login dropdown + Get Started */
              <>
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => { setDropdownOpen((v) => !v); setLoginError('') }}
                    className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg border transition-colors ${
                      dropdownOpen
                        ? 'bg-border/50 border-border text-text-primary'
                        : 'border-border text-text-primary hover:bg-border/40'
                    }`}
                  >
                    Login
                    <svg
                      className={`w-3.5 h-3.5 transition-transform text-muted ${dropdownOpen ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Sign-in dropdown */}
                  {dropdownOpen && (
                    <div className="absolute right-0 top-12 w-80 bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-4">
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted uppercase tracking-wider">Sign in as</p>
                        <div className="grid grid-cols-2 gap-2">
                          {(['ADMIN', 'CLIENT'] as const).map((r) => (
                            <button
                              key={r}
                              onClick={() => { setSigninRole(r); setLoginError('') }}
                              className={`py-2 rounded-xl text-sm font-medium border transition-colors ${
                                signinRole === r
                                  ? 'bg-accent/10 border-accent/40 text-accent'
                                  : 'border-border text-muted hover:text-text-primary hover:border-accent/20'
                              }`}
                            >
                              {r === 'ADMIN' ? 'Studio Admin' : 'Client'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {signinRole === 'ADMIN' ? (
                        <form onSubmit={handleLogin} className="space-y-3">
                          <input
                            type="email" placeholder="Email" value={email} required
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors"
                          />
                          <input
                            type="password" placeholder="Password" value={password} required
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors"
                          />
                          {loginError && <p className="text-xs text-danger font-medium">{loginError}</p>}
                          <button
                            type="submit" disabled={loggingIn}
                            className="w-full bg-accent text-bg font-semibold py-2.5 rounded-xl text-sm hover:bg-accent/90 transition-colors disabled:opacity-60"
                          >
                            {loggingIn ? 'Signing in…' : 'Sign in'}
                          </button>
                        </form>
                      ) : (
                        <div className="bg-bg border border-border rounded-xl p-4 space-y-1">
                          <p className="text-sm font-semibold text-text-primary">Looking for your gallery?</p>
                          <p className="text-sm text-muted leading-relaxed">
                            Use the link your photographer sent to your email — it opens your gallery directly. No separate login needed.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <Link
                  href="/studio/login"
                  className="text-sm font-bold px-4 py-2 rounded-lg bg-accent text-bg hover:bg-accent/90 transition-colors"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>

          {/* Mobile — hamburger button */}
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
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile drawer ─────────────────────────────────────────── */}
      <div
        className={`fixed top-14 left-0 right-0 z-50 md:hidden bg-card border-b border-border shadow-2xl
          transition-all duration-200 ease-out
          ${mobileOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}
      >
        <div className="px-5 pb-6 pt-3">

          {isLoggedIn ? (
            /* Logged-in mobile drawer */
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
              {(auth as Auth).role === 'ADMIN' && (
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
            /* Not logged in mobile drawer */
            <>
              {MARKETING_LINKS.map(({ label, href }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={closeAll}
                  className="flex items-center justify-between py-3.5 text-base font-medium text-text-primary border-b border-border/40 last:border-0 hover:text-accent transition-colors"
                >
                  {label}
                  <span className="text-muted text-sm">→</span>
                </Link>
              ))}

              <div className="grid grid-cols-2 gap-3 mt-5">
                <button
                  onClick={() => { closeAll(); router.push('/studio/login') }}
                  className="py-3 rounded-xl border border-border text-text-primary text-sm font-semibold hover:bg-border/40 transition-colors"
                >
                  Login
                </button>
                <Link
                  href="/studio/login"
                  onClick={closeAll}
                  className="py-3 rounded-xl bg-accent text-bg text-sm font-bold text-center hover:bg-accent/90 transition-colors"
                >
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
