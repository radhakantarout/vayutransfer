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

  const inputBase = 'w-full bg-bg border rounded-2xl px-4 py-3.5 text-sm text-text-primary placeholder:text-muted/70 focus:outline-none transition-colors shadow-sm'
  const inputClass = (k: 'name' | 'phoneDigits') =>
    `${inputBase} ${fieldError(k) ? 'border-danger focus:border-danger' : 'border-border/60 focus:border-accent'}`

  return (
    <AuthShell closeLabel="Cancel">
      <div className="w-full max-w-sm space-y-7 pt-8">
        <div className="text-center space-y-2.5">
          <div className="text-2xl animate-reel-float">✨</div>
          <h1 className="text-2xl font-extrabold text-text-primary">Let&apos;s make this yours <span aria-hidden>✨</span></h1>
          <p className="text-sm text-muted leading-relaxed max-w-[280px] mx-auto">
            A name and phone number is all we need to get your moment started.
          </p>
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
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="sr-only">Signing up as {email}</p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted pl-1">First name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                placeholder="Priya"
                className={inputClass('name')}
              />
              {fieldError('name') && <p className="text-xs text-danger pl-1">{fieldError('name')}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted pl-1">Phone number</label>
              <div className={`flex items-center border rounded-2xl overflow-hidden shadow-sm transition-colors ${fieldError('phoneDigits') ? 'border-danger' : 'border-border/60 focus-within:border-accent'}`}>
                <span className="bg-bg text-muted text-sm pl-4 pr-2 py-3.5 select-none whitespace-nowrap">+91</span>
                <input
                  type="tel"
                  value={phoneDigits}
                  onChange={(e) => setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  onBlur={() => setTouched((t) => ({ ...t, phoneDigits: true }))}
                  placeholder="9876543210"
                  maxLength={10}
                  className="flex-1 bg-bg pr-4 py-3.5 text-sm text-text-primary placeholder:text-muted/70 focus:outline-none"
                />
              </div>
              {fieldError('phoneDigits') && <p className="text-xs text-danger pl-1">{fieldError('phoneDigits')}</p>}
            </div>

            {submitError && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg px-3.5 py-2.5 text-sm text-danger">{submitError}</div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full text-white font-bold py-3.5 rounded-2xl text-sm transition-opacity disabled:opacity-50 hover:opacity-90"
              style={{ background: 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)' }}
            >
              {submitting ? 'Setting up…' : 'Continue'}
            </button>
            <p className="text-[11px] text-muted text-center">Your details stay private <span aria-hidden>🔒</span></p>
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
