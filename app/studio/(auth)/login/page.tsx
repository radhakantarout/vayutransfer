'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function StudioLoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/studio/api/auth/admin-login', {
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

      if (data.data.role === 'OWNER') {
        router.push('/studio/admin')
      } else {
        router.push('/studio/dashboard')
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-2xl font-extrabold text-text-primary">
            Vayu<span className="text-accent">Studio</span>
          </div>
          <p className="text-muted text-sm mt-1">Gallery delivery for photographers</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-8 space-y-5">
          <h1 className="text-lg font-bold text-text-primary">Sign in</h1>

          <div className="space-y-2">
            <label className="text-sm text-muted">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent"
              placeholder="you@studio.com"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent text-bg font-bold py-3 rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-muted mt-6">
          Client? Use the link shared by your photographer.
        </p>
      </div>
    </div>
  )
}
