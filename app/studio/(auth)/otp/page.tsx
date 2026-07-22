'use client'

import { useState, Suspense, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const OTP_TTL_SECONDS = 600

function formatTime(s: number) {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

interface ClientInfo {
  clientName: string
  clientEmail: string
  clientPhone: string
  studioName: string
  isReturning: boolean
  sharePasswordProtected: boolean
}

function OTPForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectToken = searchParams.get('t') ?? ''

  const [info, setInfo]           = useState<ClientInfo | null>(null)
  const [infoError, setInfoError] = useState<string | null>(null)

  // Form fields
  const [name, setName]   = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [step, setStep]           = useState<'checking' | 'password' | 'profile' | 'otp'>('checking')
  const [passwordInput, setPasswordInput] = useState('')
  const [otp, setOtp]             = useState('')
  const [sessionId, setSessionId] = useState('')
  const [error, setError]         = useState<string | null>(null)
  const [loading, setLoading]     = useState(false)
  const [resending, setResending] = useState(false)
  const [timeLeft, setTimeLeft]   = useState(OTP_TTL_SECONDS)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    setTimeLeft(OTP_TTL_SECONDS)
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(timerRef.current!); return 0 }
        return t - 1
      })
    }, 1000)
  }, [])

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  // Grants access with no OTP round trip — either the link isn't password-
  // protected at all (default), or the visitor supplied the static password
  // shown to the admin at link-creation time.
  const grantDirectAccess = useCallback(async (password?: string, emailAddr?: string, nameVal?: string, phoneVal?: string) => {
    const res = await fetch('/studio/api/auth/client-gallery-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectToken, password, email: emailAddr, name: nameVal, phone: phoneVal }),
    })
    const data = await res.json()
    if (!data.success) {
      if (data.error === 'INVALID_PASSWORD') return 'INVALID_PASSWORD'
      if (data.error === 'EMAIL_REQUIRED') return 'EMAIL_REQUIRED'
      return 'ERROR'
    }
    router.push(`/studio/gallery/${projectToken}`)
    return 'OK'
  }, [projectToken, router])

  // Load project/client info on mount
  useEffect(() => {
    if (!projectToken) { setInfoError('Invalid gallery link.'); return }
    fetch(`/studio/api/auth/client-info?t=${projectToken}`)
      .then((r) => r.json())
      .then(async (data) => {
        if (!data.success) {
          setInfoError(
            data.error === 'TOKEN_EXPIRED'
              ? 'This gallery link has expired. Please contact your photographer.'
              : 'Invalid or expired gallery link.'
          )
          return
        }
        const d: ClientInfo = data.data
        setInfo(d)
        setName(d.clientName)
        setEmail(d.clientEmail)
        setPhone(d.clientPhone)

        if (d.sharePasswordProtected) {
          setStep('password')
          return
        }
        // Not protected — try a silent direct grant. If the project has no
        // clientEmail on file yet, fall back to asking for one (still no OTP).
        if (d.clientEmail) {
          const result = await grantDirectAccess(undefined, d.clientEmail, d.clientName, d.clientPhone)
          if (result !== 'OK') setStep('profile')
        } else {
          setStep('profile')
        }
      })
      .catch(() => setInfoError('Could not load gallery info. Please try again.'))
  }, [projectToken, grantDirectAccess])

  const sendOTP = async (emailAddr: string): Promise<string | null> => {
    const res = await fetch('/studio/api/auth/client-otp-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailAddr, projectToken }),
    })
    const data = await res.json()
    if (!data.success) {
      setError(data.error === 'TOKEN_EXPIRED' ? 'This gallery link has expired.' : 'Failed to send OTP. Try again.')
      return null
    }
    return data.data.sessionId
  }

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      // Reached via "Email me a code instead" on a password-protected link —
      // keep using the existing live-emailed-OTP flow, unchanged.
      if (info?.sharePasswordProtected) {
        const sid = await sendOTP(email)
        if (!sid) return
        setSessionId(sid)
        setStep('otp')
        startTimer()
        return
      }
      // Not protected, just missing a clientEmail on file — grant directly,
      // no code of any kind.
      const result = await grantDirectAccess(undefined, email, name, phone)
      if (result === 'ERROR') setError('Could not access gallery. Please try again.')
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await grantDirectAccess(passwordInput, email, name, phone)
      if (result === 'INVALID_PASSWORD') setError('Incorrect password — try again.')
      else if (result === 'ERROR') setError('Could not access gallery. Please try again.')
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  const resendOTP = async () => {
    setError(null)
    setResending(true)
    setOtp('')
    try {
      const sid = await sendOTP(email)
      if (!sid) return
      setSessionId(sid)
      startTimer()
    } catch {
      setError('Network error — please try again')
    } finally {
      setResending(false)
    }
  }

  const verifyOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/studio/api/auth/client-otp-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, otp, projectToken, name, phone: phone || undefined }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error === 'INVALID_OTP' ? 'Incorrect OTP — try again.' : 'Verification failed. Request a new OTP.')
        return
      }
      router.push(`/studio/gallery/${projectToken}`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  // ── Loading state — also covers the silent no-password direct-grant
  // attempt, which never shows a form of its own. ──
  if ((!info && !infoError) || step === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Error state ──
  if (infoError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-3 max-w-sm">
          <div className="text-4xl">🔗</div>
          <div className="text-text-primary font-semibold">{infoError}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-2xl font-extrabold text-text-primary">
            Vayu<span className="text-accent">Studio</span>
          </div>
          <p className="text-muted text-sm mt-1">{info!.studioName}</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 space-y-5">

          {/* ── STEP: Password (password-protected links) ── */}
          {step === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              <div>
                <h1 className="text-lg font-bold text-text-primary">Enter password</h1>
                <p className="text-sm text-muted mt-1">This gallery is password-protected. Ask your photographer for the code.</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted">Password</label>
                <input
                  type="text"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value.toUpperCase())}
                  required
                  autoFocus
                  autoCapitalize="characters"
                  placeholder="Access code"
                  className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent tracking-[0.3em] text-center font-mono"
                />
              </div>

              {error && (
                <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">{error}</div>
              )}

              <button
                type="submit"
                disabled={loading || !passwordInput}
                className="w-full bg-accent text-bg font-bold py-3 rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Checking…' : 'View Gallery'}
              </button>

              <button
                type="button"
                onClick={() => { setStep('profile'); setError(null); setPasswordInput('') }}
                className="w-full text-sm text-muted hover:text-text-primary transition-colors"
              >
                Email me a code instead
              </button>
            </form>
          )}

          {/* ── STEP: Profile confirm / signup ── */}
          {step === 'profile' && (
            <form onSubmit={handleProfileSubmit} className="space-y-5">
              {info!.isReturning ? (
                <>
                  <div>
                    <h1 className="text-lg font-bold text-text-primary">Welcome back!</h1>
                    <p className="text-sm text-muted mt-1">
                      We'll send a verification code to <strong className="text-text-primary">{email}</strong>
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <h1 className="text-lg font-bold text-text-primary">Access your gallery</h1>
                    <p className="text-sm text-muted mt-1">Confirm your details to continue.</p>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted">Your name</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        placeholder="Ravi Kumar"
                        className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted">Email address</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        placeholder="you@example.com"
                        className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted">
                        Mobile number
                        <span className="text-muted/60 ml-1">(optional)</span>
                      </label>
                      <div className="flex gap-2">
                        <span className="bg-bg border border-border rounded-lg px-3 py-3 text-sm text-muted flex items-center">+91</span>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          placeholder="9876543210"
                          className="flex-1 bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {error && (
                <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">{error}</div>
              )}

              <button
                type="submit"
                disabled={loading || !email}
                className="w-full bg-accent text-bg font-bold py-3 rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {info?.sharePasswordProtected
                  ? (loading ? 'Sending code…' : 'Send verification code')
                  : (loading ? 'Loading…' : 'View Gallery')}
              </button>
            </form>
          )}

          {/* ── STEP: OTP entry ── */}
          {step === 'otp' && (
            <form onSubmit={verifyOTP} className="space-y-5">
              <div>
                <h1 className="text-lg font-bold text-text-primary">Enter verification code</h1>
                <p className="text-sm text-muted mt-1">
                  Sent to <strong className="text-text-primary">{email}</strong>
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted">6-digit code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  pattern="[0-9]{6}"
                  placeholder="_ _ _ _ _ _"
                  autoFocus
                  className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent tracking-[0.5em] text-center text-xl font-mono"
                />
              </div>

              {/* Countdown / resend */}
              <div className="flex items-center justify-between text-sm">
                {timeLeft > 0 ? (
                  <>
                    <span className="text-muted">Code expires in</span>
                    <span className={`font-mono font-semibold tabular-nums ${timeLeft <= 60 ? 'text-danger' : 'text-accent'}`}>
                      {formatTime(timeLeft)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-muted">Didn't receive it?</span>
                    <button
                      type="button"
                      onClick={resendOTP}
                      disabled={resending}
                      className="text-accent font-semibold hover:underline disabled:opacity-50"
                    >
                      {resending ? 'Sending…' : 'Resend code'}
                    </button>
                  </>
                )}
              </div>

              {error && (
                <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">{error}</div>
              )}

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full bg-accent text-bg font-bold py-3 rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Verifying…' : 'Verify & View Gallery'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('profile')
                  setOtp('')
                  setError(null)
                  if (timerRef.current) clearInterval(timerRef.current)
                }}
                className="w-full text-sm text-muted hover:text-text-primary transition-colors"
              >
                ← Change email
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default function OTPPage() {
  return (
    <Suspense>
      <OTPForm />
    </Suspense>
  )
}
