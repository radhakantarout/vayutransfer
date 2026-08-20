'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { MailIcon } from '@/components/icons'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Step = 'email' | 'otp'

export default function EmailOtpForm({ mode, callbackUrl = '/' }: { mode: 'signup' | 'login'; callbackUrl?: string }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const requestOtp = async () => {
    const trimmed = email.trim().toLowerCase()
    if (!EMAIL_RE.test(trimmed)) {
      setError('Enter a valid email address')
      return
    }
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })
      const data = await res.json()
      if (data.success) {
        setStep('otp')
      } else if (res.status === 429) {
        // A code was already sent recently and is presumably still valid
        // (within the 10-minute window) — let them proceed to enter it
        // rather than getting stuck.
        setNotice('A code was already sent — check your inbox, or wait a moment to request a new one.')
        setStep('otp')
      } else {
        setError(data.message ?? 'Could not send a code — please try again')
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  const verifyOtp = async () => {
    if (otp.trim().length !== 6) {
      setError('Enter the 6-digit code')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await signIn('otp', {
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
        redirect: false,
        callbackUrl,
      })
      if (res?.error) {
        setError('That code didn\'t work. Check it and try again, or resend a new one below.')
        return
      }
      router.push(callbackUrl)
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'email') {
    return (
      <div className="space-y-3">
        <div>
          <label className="text-sm text-muted block mb-1.5">Email address</label>
          <div className="relative">
            <MailIcon className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && requestOtp()}
              placeholder="you@example.com"
              autoFocus
              className="w-full bg-bg border border-border rounded-xl pl-10 pr-3 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60"
            />
          </div>
        </div>
        {error && <div className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</div>}
        <button
          onClick={requestOtp}
          disabled={loading}
          className="w-full bg-gradient-to-r from-accent to-[#7C3AED] text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? 'Sending…' : mode === 'signup' ? 'Continue' : 'Get login code'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm text-muted">6-digit code</label>
          <button onClick={() => { setStep('email'); setOtp(''); setError(null); setNotice(null) }} className="text-xs text-accent hover:underline">
            Change email
          </button>
        </div>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && verifyOtp()}
          placeholder="000000"
          autoFocus
          className="w-full bg-bg border border-border rounded-xl px-3 py-3 text-center text-2xl font-mono tracking-[0.5em] text-text-primary placeholder:text-muted/40 focus:outline-none focus:border-accent/60"
        />
        <p className="text-xs text-muted mt-1.5">Sent to {email}. Valid for 10 minutes.</p>
      </div>
      {notice && <div className="text-xs text-accent bg-accent/10 border border-accent/20 rounded-lg px-3 py-2">{notice}</div>}
      {error && (
        <div className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2 space-y-1">
          <div>{error}</div>
          <button onClick={requestOtp} className="text-danger font-semibold hover:underline">Resend code</button>
        </div>
      )}
      <button
        onClick={verifyOtp}
        disabled={loading || otp.length !== 6}
        className="w-full bg-gradient-to-r from-accent to-[#7C3AED] text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {loading ? 'Verifying…' : 'Verify & Continue'}
      </button>
    </div>
  )
}
