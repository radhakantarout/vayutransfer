'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
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

export default function StudioNavbar() {
  const [auth, setAuth] = useState<Auth | null | 'loading'>('loading')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [signinRole, setSigninRole] = useState<'ADMIN' | 'CLIENT'>('ADMIN')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    fetch('/studio/api/auth/me')
      .then((r) => r.json())
      .then((d) => setAuth(d.data ?? null))
      .catch(() => setAuth(null))
  }, [])

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    setLoggingIn(true)
    try {
      const res = await fetch('/studio/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        const msg =
          data.error === 'INVALID_CREDENTIALS'
            ? 'Wrong email or password'
            : data.error === 'ACCOUNT_SUSPENDED'
            ? 'Account suspended'
            : 'Sign in failed'
        setLoginError(msg)
      } else {
        const role: StudioRole = data.data?.role
        setDropdownOpen(false)
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
    setAuth(null)
    router.push('/studio/home')
    router.refresh()
  }

  return (
    <nav className="sticky top-0 z-50 bg-card border-b border-border">
      <div className="px-5 h-14 flex items-center justify-between gap-4">

        {/* Logo */}
        <Link href="/studio/home" className="text-lg font-extrabold text-text-primary flex-shrink-0">
          Vayu<span className="text-accent">Studio</span>
        </Link>

        {/* Role-aware nav links */}
        {auth && auth !== 'loading' && (
          <div className="hidden md:flex items-center gap-6 text-sm">
            {auth.role === 'OWNER' && (
              <>
                <Link href="/studio/admin/studios" className="text-muted hover:text-text-primary transition-colors">
                  Studios
                </Link>
                <Link href="/studio/admin/users" className="text-muted hover:text-text-primary transition-colors">
                  Users
                </Link>
              </>
            )}
            {auth.role === 'ADMIN' && (
              <Link href="/studio/dashboard" className="text-muted hover:text-text-primary transition-colors">
                Dashboard
              </Link>
            )}
          </div>
        )}

        {/* Right side */}
        <div className="flex items-center gap-3 ml-auto">
          {auth === 'loading' ? (
            <div className="w-24 h-8 bg-border rounded-lg animate-pulse" />
          ) : auth ? (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex items-center text-xs font-medium text-accent bg-accent/10 border border-accent/20 rounded-full px-3 py-1">
                {ROLE_LABEL[auth.role]}
              </span>
              <button
                onClick={handleLogout}
                className="text-sm text-muted hover:text-danger transition-colors px-3 py-1.5 rounded-lg hover:bg-danger/10"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => {
                  setDropdownOpen((v) => !v)
                  setLoginError('')
                }}
                className="flex items-center gap-1.5 bg-accent text-bg text-sm font-semibold px-4 py-2 rounded-lg hover:bg-accent/90 transition-colors"
              >
                Sign In
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-12 w-80 bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-4">

                  {/* Role selector */}
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
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors"
                      />
                      <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors"
                      />
                      {loginError && (
                        <p className="text-xs text-danger font-medium">{loginError}</p>
                      )}
                      <button
                        type="submit"
                        disabled={loggingIn}
                        className="w-full bg-accent text-bg font-semibold py-2.5 rounded-xl text-sm hover:bg-accent/90 transition-colors disabled:opacity-60"
                      >
                        {loggingIn ? 'Signing in…' : 'Sign in'}
                      </button>
                    </form>
                  ) : (
                    <div className="bg-bg border border-border rounded-xl p-4 space-y-1">
                      <p className="text-sm font-semibold text-text-primary">
                        Looking for your gallery?
                      </p>
                      <p className="text-sm text-muted leading-relaxed">
                        Use the link your photographer sent to your email — it opens your gallery directly. No separate login needed.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </nav>
  )
}
