'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import AuthShell from '@/components/studio/AuthShell'
import GoogleIcon from '@/components/studio/GoogleIcon'

type Role        = 'ADMIN' | 'PRINT' | 'CLIENT'
type ForgotStep  = 'email' | 'otp' | 'password'

function validatePassword(pw: string): string | null {
  if (pw.length < 8)               return 'At least 8 characters required'
  if (!/[A-Z]/.test(pw))           return 'Add at least one uppercase letter (A–Z)'
  if (!/[a-z]/.test(pw))           return 'Add at least one lowercase letter (a–z)'
  if (!/[^A-Za-z0-9]/.test(pw))   return 'Add at least one symbol (e.g. @, #, $, !)'
  return null
}

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null
  const checks = [password.length >= 8, /[A-Z]/.test(password), /[a-z]/.test(password), /[^A-Za-z0-9]/.test(password)]
  const score   = checks.filter(Boolean).length
  const colors  = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500']
  const labels  = ['Weak', 'Fair', 'Good', 'Strong']
  const textCls = ['text-red-500', 'text-orange-500', 'text-yellow-500', 'text-green-500']
  const hint    = !checks[0] ? '8+ chars needed' : !checks[1] ? 'Add uppercase letter' : !checks[2] ? 'Add lowercase letter' : !checks[3] ? 'Add a symbol (@#$!)' : 'Password looks great'
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {[0,1,2,3].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i < score ? colors[score - 1] : 'bg-border'}`} />
        ))}
      </div>
      <p className={`text-[10px] font-semibold flex items-center gap-1 ${textCls[score - 1] ?? 'text-muted'}`}>
        <span>{labels[score - 1] ?? 'Weak'}</span>
        <span className="font-normal text-muted">— {hint}</span>
      </p>
    </div>
  )
}

const ROLES: { value: Role; label: string; description: string }[] = [
  { value: 'ADMIN',  label: 'Studio Admin',  description: 'Manage projects & galleries' },
  { value: 'PRINT',  label: 'Print Admin',   description: 'Access print download links'  },
  { value: 'CLIENT', label: 'Customer',      description: 'View your photo gallery'       },
]

const ROLE_REDIRECT: Record<string, string> = {
  OWNER: '/studio/admin/studios',
  ADMIN: '/studio/dashboard',
  PRINT: '/studio/dashboard',
}

function LoginPageInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  /* ── Login state ─────────────────────────────── */
  const [role, setRole]         = useState<Role>('ADMIN')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)

  /* ── Forgot-password state ───────────────────── */
  const [showForgot, setShowForgot]     = useState(false)
  const [forgotStep, setForgotStep]     = useState<ForgotStep>('email')
  const [fpEmail, setFpEmail]           = useState('')
  const [fpOtp, setFpOtp]               = useState('')
  const [fpPassword, setFpPassword]     = useState('')
  const [fpConfirm, setFpConfirm]       = useState('')
  const [fpToken, setFpToken]           = useState('')       // JWT from send-otp
  const [fpResetToken, setFpResetToken] = useState('')       // JWT from verify-otp
  const [fpError, setFpError]           = useState<string | null>(null)
  const [fpLoading, setFpLoading]       = useState(false)
  const [fpDone, setFpDone]             = useState(false)

  /* ── Auto-open setup flow from email link ────── */
  useEffect(() => {
    const isSetup    = searchParams.get('setup') === '1'
    const setupEmail = searchParams.get('email')
    if (isSetup && setupEmail) {
      setFpEmail(setupEmail)
      setShowForgot(true)
    }
  }, [])

  /* ── Surface errors redirected back from Google sign-in ─ */
  useEffect(() => {
    const error = searchParams.get('error')
    if (error === 'SUSPENDED') setLoginError('Your account has been suspended')
    else if (error === 'INVALID_ACCOUNT') setLoginError('No studio admin account found for this Google email')
    else if (error === 'OAUTH_FAILED') setLoginError('Google sign-in failed — please try again')
  }, [])

  const nextParam = searchParams.get('next')
  const googleHref = `/studio/api/auth/google${nextParam ? `?next=${encodeURIComponent(nextParam)}` : ''}`

  /* ── Login submit ────────────────────────────── */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    setLoginLoading(true)
    try {
      const res  = await fetch('/studio/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!data.success) {
        setLoginError(
          data.error === 'INVALID_CREDENTIALS' ? 'Invalid email or password' :
          data.error === 'ACCOUNT_SUSPENDED'   ? 'Your account has been suspended' :
          'Something went wrong — please try again'
        )
        return
      }
      const next = searchParams.get('next')
      router.push(next?.startsWith('/studio/') ? next : (ROLE_REDIRECT[data.data.role] ?? '/studio/dashboard'))
    } catch {
      setLoginError('Network error — please try again')
    } finally {
      setLoginLoading(false)
    }
  }

  /* ── Forgot: step 1 — send OTP ───────────────── */
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setFpError(null)
    setFpLoading(true)
    try {
      const res  = await fetch('/studio/api/auth/reset/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fpEmail }),
      })
      const data = await res.json()
      if (!data.success) {
        setFpError(data.error === 'INVALID_EMAIL' ? 'No account found with this email' : 'Something went wrong')
        return
      }
      setFpToken(data.token)
      setForgotStep('otp')
    } catch {
      setFpError('Network error — please try again')
    } finally {
      setFpLoading(false)
    }
  }

  /* ── Forgot: step 2 — verify OTP ────────────── */
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setFpError(null)
    setFpLoading(true)
    try {
      const res  = await fetch('/studio/api/auth/reset/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: fpToken, otp: fpOtp }),
      })
      const data = await res.json()
      if (!data.success) {
        setFpError(
          data.error === 'INVALID_OTP' ? 'Incorrect OTP — please check and try again' :
          data.error === 'OTP_EXPIRED'  ? 'OTP has expired — please request a new one' :
          'Something went wrong'
        )
        return
      }
      setFpResetToken(data.resetToken)
      setForgotStep('password')
    } catch {
      setFpError('Network error — please try again')
    } finally {
      setFpLoading(false)
    }
  }

  /* ── Forgot: step 3 — set new password ──────── */
  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setFpError(null)
    const pwErr = validatePassword(fpPassword)
    if (pwErr) { setFpError(pwErr); return }
    if (fpPassword !== fpConfirm) {
      setFpError('Passwords do not match — please retype')
      return
    }
    setFpLoading(true)
    try {
      const res  = await fetch('/studio/api/auth/reset/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToken: fpResetToken, password: fpPassword }),
      })
      const data = await res.json()
      if (!data.success) {
        setFpError('Something went wrong — please start over')
        return
      }
      setFpDone(true)
    } catch {
      setFpError('Network error — please try again')
    } finally {
      setFpLoading(false)
    }
  }

  const resetForgot = () => {
    setShowForgot(false)
    setForgotStep('email')
    setFpEmail(''); setFpOtp(''); setFpPassword(''); setFpConfirm('')
    setFpToken(''); setFpResetToken('')
    setFpError(null); setFpDone(false)
  }

  /* ── Render ──────────────────────────────────── */
  return (
    <AuthShell>
      <div className="w-full max-w-sm space-y-6 pt-4">

        {!showForgot && (
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-extrabold text-text-primary">Log in to Vayu<span className="text-accent">Studios</span></h1>
            <p className="text-sm text-muted">
              New to VayuStudios?{' '}
              <Link href="/studio/get-started" className="text-accent hover:underline">
                Request studio setup →
              </Link>
            </p>
          </div>
        )}

        {/* ── FORGOT PASSWORD FLOW ─────────────────── */}
        {showForgot ? (
          <div className="space-y-4">
            {/* Step indicator */}
            <div className="flex items-center justify-center gap-2">
              {(['email', 'otp', 'password'] as ForgotStep[]).map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    forgotStep === s
                      ? 'bg-accent text-bg'
                      : fpDone || (['email','otp','password'] as ForgotStep[]).indexOf(forgotStep) > i
                        ? 'bg-success/20 text-success border border-success/30'
                        : 'bg-border text-muted'
                  }`}>
                    {i + 1}
                  </div>
                  {i < 2 && <div className="w-6 h-px bg-border" />}
                </div>
              ))}
            </div>

            {fpDone ? (
              /* Success */
              <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-3">
                <div className="text-3xl">✅</div>
                <p className="font-semibold text-text-primary">Password updated!</p>
                <p className="text-sm text-muted">You can now sign in with your new password.</p>
                <button
                  onClick={resetForgot}
                  className="w-full mt-2 bg-accent text-bg font-bold py-2.5 rounded-xl text-sm hover:bg-accent/90 transition-colors"
                >
                  Back to login
                </button>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
                <p className="text-xs font-semibold text-muted uppercase tracking-wider">
                  {forgotStep === 'email'    ? 'Step 1 — Enter your email' :
                   forgotStep === 'otp'      ? `Step 2 — Enter the OTP sent to ${fpEmail}` :
                                              'Step 3 — Set new password'}
                </p>

                {/* Step 1: email */}
                {forgotStep === 'email' && (
                  <form onSubmit={handleSendOtp} className="space-y-3">
                    <input
                      type="email"
                      value={fpEmail}
                      onChange={(e) => { setFpEmail(e.target.value); setFpError(null) }}
                      required
                      autoFocus
                      placeholder="your@email.com"
                      className="w-full bg-bg border border-border rounded-lg px-3.5 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
                    />
                    {fpError && <p className="text-xs text-danger font-medium">{fpError}</p>}
                    <button
                      type="submit" disabled={fpLoading}
                      className="w-full bg-accent text-bg font-bold py-2.5 rounded-xl text-sm hover:bg-accent/90 transition-colors disabled:opacity-50"
                    >
                      {fpLoading ? 'Sending…' : 'Send OTP'}
                    </button>
                  </form>
                )}

                {/* Step 2: OTP */}
                {forgotStep === 'otp' && (
                  <form onSubmit={handleVerifyOtp} className="space-y-3">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={fpOtp}
                      onChange={(e) => { setFpOtp(e.target.value.replace(/\D/g, '')); setFpError(null) }}
                      required
                      autoFocus
                      placeholder="6-digit OTP"
                      className="w-full bg-bg border border-border rounded-lg px-3.5 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent transition-colors tracking-widest text-center font-mono"
                    />
                    {fpError && <p className="text-xs text-danger font-medium">{fpError}</p>}
                    <button
                      type="submit" disabled={fpLoading || fpOtp.length !== 6}
                      className="w-full bg-accent text-bg font-bold py-2.5 rounded-xl text-sm hover:bg-accent/90 transition-colors disabled:opacity-50"
                    >
                      {fpLoading ? 'Verifying…' : 'Verify OTP'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setForgotStep('email'); setFpOtp(''); setFpError(null) }}
                      className="w-full text-xs text-muted hover:text-text-primary transition-colors"
                    >
                      Resend OTP
                    </button>
                  </form>
                )}

                {/* Step 3: new password */}
                {forgotStep === 'password' && (
                  <form onSubmit={handleSetPassword} className="space-y-3">
                    <div className="space-y-1.5">
                      <input
                        type="password"
                        value={fpPassword}
                        onChange={(e) => { setFpPassword(e.target.value); setFpError(null) }}
                        required
                        autoFocus
                        placeholder="New password"
                        className="w-full bg-bg border border-border rounded-lg px-3.5 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
                      />
                      <PasswordStrength password={fpPassword} />
                    </div>
                    <div className="space-y-1.5">
                      <input
                        type="password"
                        value={fpConfirm}
                        onChange={(e) => { setFpConfirm(e.target.value); setFpError(null) }}
                        required
                        placeholder="Confirm new password"
                        className={`w-full bg-bg border rounded-lg px-3.5 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none transition-colors ${fpConfirm && fpPassword !== fpConfirm ? 'border-danger focus:border-danger' : 'border-border focus:border-accent'}`}
                      />
                      {fpConfirm && fpPassword !== fpConfirm && (
                        <p className="text-[10px] text-danger font-medium">Passwords do not match</p>
                      )}
                    </div>
                    {fpError && <p className="text-xs text-danger font-medium">{fpError}</p>}
                    <button
                      type="submit" disabled={fpLoading || !!validatePassword(fpPassword) || fpPassword !== fpConfirm}
                      className="w-full bg-accent text-bg font-bold py-2.5 rounded-xl text-sm hover:bg-accent/90 transition-colors disabled:opacity-50"
                    >
                      {fpLoading ? 'Updating…' : 'Set new password'}
                    </button>
                  </form>
                )}
              </div>
            )}

            {!fpDone && (
              <button
                onClick={resetForgot}
                className="w-full text-xs text-muted hover:text-text-primary transition-colors text-center"
              >
                ← Back to login
              </button>
            )}
          </div>
        ) : (
          /* ── NORMAL LOGIN FLOW ───────────────────── */
          <>
            {/* Role selector */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted text-center uppercase tracking-wider">Sign in as</p>
              <div className="grid grid-cols-3 gap-2">
                {ROLES.map(({ value, label, description }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setRole(value); setLoginError(null) }}
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

            {role === 'CLIENT' ? (
              <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-3">
                <div className="text-2xl">📸</div>
                <p className="text-sm font-semibold text-text-primary">Looking for your gallery?</p>
                <p className="text-sm text-muted leading-relaxed">
                  Your photographer sent you a unique link by email or WhatsApp. Open that link to access your photos — no separate login needed.
                </p>
                <p className="text-xs text-muted pt-1">
                  Can&apos;t find the link?{' '}
                  <a href="mailto:support@vayutransfer.com" className="text-accent hover:underline">
                    Contact support
                  </a>
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {role === 'ADMIN' && (
                  <>
                    <a
                      href={googleHref}
                      className="flex items-center justify-center gap-2.5 w-full bg-card border border-border rounded-xl py-2.5 text-sm font-semibold text-text-primary hover:border-accent/40 transition-colors"
                    >
                      <GoogleIcon />
                      Continue with Google
                    </a>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-xs text-muted whitespace-nowrap">Or use your email</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  </>
                )}
              <form onSubmit={handleLogin} className="bg-card border border-border rounded-2xl p-6 space-y-4">
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

                {loginError && (
                  <div className="bg-danger/10 border border-danger/30 rounded-lg px-3.5 py-2.5 text-sm text-danger">
                    {loginError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full bg-accent text-bg font-bold py-2.5 rounded-xl text-sm hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loginLoading ? 'Signing in…' : 'Sign in'}
                </button>

                <button
                  type="button"
                  onClick={() => { setShowForgot(true); setFpEmail(email) }}
                  className="w-full text-xs text-muted hover:text-accent transition-colors text-center"
                >
                  Forgot password?
                </button>
              </form>
              </div>
            )}
          </>
        )}
      </div>
    </AuthShell>
  )
}

export default function StudioLoginPage() {
  return (
    <Suspense fallback={<AuthShell><div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin mt-20" /></AuthShell>}>
      <LoginPageInner />
    </Suspense>
  )
}
