'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

type Role = 'ADMIN' | 'PRINT' | 'CLIENT'

const ROLES: { value: Role; label: string; description: string }[] = [
  { value: 'ADMIN',  label: 'Studio Admin',  description: 'Manage projects & galleries' },
  { value: 'PRINT',  label: 'Print Admin',   description: 'Access print download links' },
  { value: 'CLIENT', label: 'Customer',      description: 'View your photo gallery' },
]

const ROLE_REDIRECT: Record<string, string> = {
  OWNER: '/studio/admin/studios',
  ADMIN: '/studio/dashboard',
  PRINT: '/studio/dashboard',
}

export default function StudioLoginPage() {
  const router = useRouter()
  const [role, setRole]         = useState<Role>('ADMIN')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res  = await fetch('/studio/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(
          data.error === 'INVALID_CREDENTIALS' ? 'Invalid email or password' :
          data.error === 'ACCOUNT_SUSPENDED'   ? 'Your account has been suspended' :
          'Something went wrong — please try again'
        )
        return
      }
      router.push(ROLE_REDIRECT[data.data.role] ?? '/studio/dashboard')
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <Image src="/logo.png" alt="VayuStudio" width={44} height={44} className="h-11 w-11" />
          <div className="text-xl font-extrabold text-text-primary">
            Vayu<span className="text-accent">Studio</span>
          </div>
        </div>

        {/* Role selector */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted text-center uppercase tracking-wider">Sign in as</p>
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map(({ value, label, description }) => (
              <button
                key={value}
                type="button"
                onClick={() => { setRole(value); setError(null) }}
                className={`flex flex-col items-center gap-1 px-2 py-3 rounded-xl border text-center transition-colors ${
                  role === value
                    ? 'bg-accent/10 border-accent/50 text-accent'
                    : 'border-border text-muted hover:border-accent/20 hover:text-text-primary'
                }`}
              >
                <span className="text-sm font-semibold leading-tight">{label}</span>
                <span className="text-[10px] leading-tight opacity-70">{description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Form or client message */}
        {role === 'CLIENT' ? (
          <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-3">
            <div className="text-2xl">📸</div>
            <p className="text-sm font-semibold text-text-primary">Looking for your gallery?</p>
            <p className="text-sm text-muted leading-relaxed">
              Your photographer sent you a unique link by email or WhatsApp. Open that link to access your photos — no separate login needed.
            </p>
            <p className="text-xs text-muted pt-1">
              Can&apos;t find the link?{' '}
              <a href="mailto:radhakanta.rout16@gmail.com" className="text-accent hover:underline">
                Contact support
              </a>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@studio.com"
                className="w-full bg-bg border border-border rounded-lg px-3.5 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full bg-bg border border-border rounded-lg px-3.5 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            {error && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg px-3.5 py-2.5 text-sm text-danger">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-bg font-bold py-2.5 rounded-xl text-sm hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-muted">
          New to VayuStudio?{' '}
          <Link href="/studio/home#get-started" className="text-accent hover:underline">
            Request studio setup →
          </Link>
        </p>
      </div>
    </div>
  )
}
