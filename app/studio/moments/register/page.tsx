'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AuthShell from '@/components/studio/AuthShell'

function validatePhone(digits: string) {
  return /^[6-9]\d{9}$/.test(digits.trim())
}

function MomentsRegisterInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const next  = searchParams.get('next')

  const [checking, setChecking]     = useState(true)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [email, setEmail]           = useState('')

  const [name, setName]             = useState('')
  const [phoneDigits, setPhoneDigits] = useState('')
  const [touched, setTouched]       = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) { setTokenError('No signup link found — please try signing in with Google again.'); setChecking(false); return }
    fetch(`/studio/api/auth/moments-onboard?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) {
          setTokenError('This link has expired — please try signing in with Google again.')
          return
        }
        setEmail(res.data.email)
        setName(res.data.name ?? '')
      })
      .catch(() => setTokenError('Something went wrong — please try signing in with Google again.'))
      .finally(() => setChecking(false))
  }, [token])

  const isValid = name.trim().length >= 2 && validatePhone(phoneDigits)

  const fieldError = (k: 'name' | 'phoneDigits'): string | null => {
    if (!touched[k]) return null
    if (k === 'name') return name.trim().length < 2 ? 'Please enter your name' : null
    if (k === 'phoneDigits') return !validatePhone(phoneDigits) ? 'Enter a valid 10-digit Indian mobile number' : null
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ name: true, phoneDigits: true })
    if (!isValid) return
    setSubmitError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/studio/api/auth/moments-onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: name.trim(), phone: `+91${phoneDigits}` }),
      }).then((r) => r.json())
      if (!res.success) {
        setSubmitError(
          res.error === 'EXPIRED_TOKEN' ? 'This link has expired — please try signing in with Google again.' :
          res.error === 'INVALID_PHONE' ? 'Enter a valid 10-digit Indian mobile number' :
          'Something went wrong — please try again'
        )
        return
      }
      router.push(next?.startsWith('/studio/moments/') ? next : '/studio/moments')
    } catch {
      setSubmitError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  const inputBase = 'w-full bg-card border rounded-lg px-3.5 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none transition-colors'
  const inputClass = (k: 'name' | 'phoneDigits') =>
    `${inputBase} ${fieldError(k) ? 'border-danger focus:border-danger' : 'border-border focus:border-accent'}`

  return (
    <AuthShell>
      <div className="w-full max-w-sm space-y-6 pt-8">
        <div className="text-center space-y-3">
          <div
            className="inline-flex w-14 h-14 rounded-2xl items-center justify-center text-2xl animate-reel-float"
            style={{ background: 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)' }}
          >
            ✨
          </div>
          <h1 className="text-2xl font-extrabold text-text-primary">Welcome to VayuStudios <span className="text-accent">Moments</span></h1>
          <p className="text-sm text-muted">A couple of details and your first gallery is ready to go.</p>
        </div>

        {checking ? (
          <div className="flex justify-center py-10">
            <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tokenError ? (
          <div className="bg-danger/10 border border-danger/30 rounded-2xl p-5 text-center space-y-3">
            <p className="text-sm text-danger">{tokenError}</p>
            <a href="/studio/login" className="inline-block text-sm text-accent hover:underline">← Back to sign in</a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted">Email</label>
              <input
                type="email"
                value={email}
                disabled
                className="w-full bg-bg border border-border rounded-lg px-3.5 py-2.5 text-sm text-muted cursor-not-allowed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted">Your name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                placeholder="Priya Sharma"
                className={inputClass('name')}
              />
              {fieldError('name') && <p className="text-xs text-danger">{fieldError('name')}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted">Phone</label>
              <div className={`flex items-center border rounded-lg overflow-hidden transition-colors ${fieldError('phoneDigits') ? 'border-danger' : 'border-border focus-within:border-accent'}`}>
                <span className="bg-muted/10 text-muted text-sm px-3 py-2.5 border-r border-border select-none whitespace-nowrap">+91</span>
                <input
                  type="tel"
                  value={phoneDigits}
                  onChange={(e) => setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  onBlur={() => setTouched((t) => ({ ...t, phoneDigits: true }))}
                  placeholder="9876543210"
                  maxLength={10}
                  className="flex-1 bg-card px-3 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none"
                />
              </div>
              {fieldError('phoneDigits') && <p className="text-xs text-danger">{fieldError('phoneDigits')}</p>}
            </div>

            {submitError && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg px-3.5 py-2.5 text-sm text-danger">{submitError}</div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full text-bg font-bold py-2.5 rounded-xl text-sm transition-opacity disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)' }}
            >
              {submitting ? 'Setting up your gallery…' : 'Start Free →'}
            </button>
            <p className="text-[11px] text-muted text-center leading-relaxed">
              Free to use — your gallery stays live for 19 days from creation, with reminders before anything is removed.
            </p>
          </form>
        )}
      </div>
    </AuthShell>
  )
}

export default function MomentsRegisterPage() {
  return (
    <Suspense fallback={<AuthShell><div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin mt-20" /></AuthShell>}>
      <MomentsRegisterInner />
    </Suspense>
  )
}
