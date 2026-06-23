'use client'

import { useState, Suspense, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const OTP_TTL_SECONDS = 600 // 10 minutes, must match server

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function OTPForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectToken = searchParams.get('t') ?? ''

  const [step, setStep]           = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone]         = useState('')
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
        if (t <= 1) {
          clearInterval(timerRef.current!)
          return 0
        }
        return t - 1
      })
    }, 1000)
  }, [])

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  const sendOTP = async (phoneNumber: string): Promise<string | null> => {
    const res = await fetch('/studio/api/auth/client-otp-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phoneNumber, projectToken }),
    })
    const data = await res.json()
    if (!data.success) {
      if (data.error === 'TOKEN_EXPIRED') setError('This gallery link has expired.')
      else setError('Failed to send OTP. Try again.')
      return null
    }
    return data.data.sessionId
  }

  const requestOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const sid = await sendOTP(phone)
      if (!sid) return
      setSessionId(sid)
      setStep('otp')
      startTimer()
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
      const sid = await sendOTP(phone)
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
        body: JSON.stringify({ sessionId, otp, projectToken }),
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

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-2xl font-extrabold text-text-primary">
            Vayu<span className="text-accent">Studio</span>
          </div>
          <p className="text-muted text-sm mt-1">Access your photo gallery</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 space-y-5">
          {step === 'phone' ? (
            <form onSubmit={requestOTP} className="space-y-5">
              <h1 className="text-lg font-bold text-text-primary">Enter your mobile number</h1>
              <p className="text-sm text-muted">We'll send you a one-time code to access your gallery.</p>

              <div className="space-y-2">
                <label className="text-sm text-muted">Mobile number</label>
                <div className="flex gap-2">
                  <span className="bg-bg border border-border rounded-lg px-3 py-3 text-sm text-muted flex items-center">+91</span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    required
                    pattern="[0-9]{10}"
                    placeholder="9876543210"
                    className="flex-1 bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">{error}</div>
              )}

              <button
                type="submit"
                disabled={loading || phone.length !== 10}
                className="w-full bg-accent text-bg font-bold py-3 rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending…' : 'Send OTP'}
              </button>
            </form>
          ) : (
            <form onSubmit={verifyOTP} className="space-y-5">
              <div>
                <h1 className="text-lg font-bold text-text-primary">Enter the OTP</h1>
                <p className="text-sm text-muted mt-1">Sent to +91 {phone}</p>
              </div>

              {/* OTP input */}
              <div className="space-y-2">
                <label className="text-sm text-muted">6-digit code</label>
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

              {/* Countdown + resend */}
              <div className="flex items-center justify-between text-sm">
                {timeLeft > 0 ? (
                  <>
                    <span className="text-muted">OTP expires in</span>
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
                      {resending ? 'Sending…' : 'Resend OTP'}
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
                {loading ? 'Verifying…' : 'Verify & Enter Gallery'}
              </button>

              <button
                type="button"
                onClick={() => { setStep('phone'); setOtp(''); setError(null); if (timerRef.current) clearInterval(timerRef.current) }}
                className="w-full text-sm text-muted hover:text-text-primary transition-colors"
              >
                ← Change number
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
