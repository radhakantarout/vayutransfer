'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AuthShell from '@/components/studio/AuthShell'
import ProductLifecycle from '@/components/studio/ProductLifecycle'

function validatePhone(digits: string) {
  return /^[6-9]\d{9}$/.test(digits.trim())
}

interface Props {
  uploadSamples: string[]
  mockupPhotos: string[]
}

function RegisterFormInner({ uploadSamples, mockupPhotos }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [checking, setChecking]   = useState(true)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [email, setEmail]         = useState('')

  const [studioName, setStudioName] = useState('')
  const [adminName, setAdminName]   = useState('')
  const [phoneDigits, setPhoneDigits] = useState('')
  const [message, setMessage]       = useState('')
  const [touched, setTouched]       = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) { setTokenError('No signup link found — please try signing in with Google again.'); setChecking(false); return }
    fetch(`/studio/api/auth/google-onboard?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) {
          setTokenError('This link has expired — please try signing in with Google again.')
          return
        }
        setEmail(res.data.email)
        setAdminName(res.data.name ?? '')
      })
      .catch(() => setTokenError('Something went wrong — please try signing in with Google again.'))
      .finally(() => setChecking(false))
  }, [token])

  const isValid =
    studioName.trim().length >= 2 &&
    adminName.trim().length >= 2 &&
    validatePhone(phoneDigits)

  const fieldError = (k: 'studioName' | 'adminName' | 'phoneDigits'): string | null => {
    if (!touched[k]) return null
    if (k === 'studioName') return studioName.trim().length < 2 ? 'Please enter your studio name' : null
    if (k === 'adminName')  return adminName.trim().length < 2 ? 'Please enter your name' : null
    if (k === 'phoneDigits') return !validatePhone(phoneDigits) ? 'Enter a valid 10-digit Indian mobile number' : null
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ studioName: true, adminName: true, phoneDigits: true })
    if (!isValid) return
    setSubmitError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/studio/api/auth/google-onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          studioName: studioName.trim(),
          adminName: adminName.trim(),
          phone: `+91${phoneDigits}`,
          message: message.trim(),
        }),
      }).then((r) => r.json())
      if (!res.success) {
        setSubmitError(
          res.error === 'EXPIRED_TOKEN' ? 'This link has expired — please try signing in with Google again.' :
          res.error === 'INVALID_PHONE' ? 'Enter a valid 10-digit Indian mobile number' :
          'Something went wrong — please try again'
        )
        return
      }
      router.push('/studio/dashboard')
    } catch {
      setSubmitError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  const inputBase = 'w-full bg-card border rounded-lg px-3.5 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none transition-colors'
  const inputClass = (k: 'studioName' | 'adminName' | 'phoneDigits') =>
    `${inputBase} ${fieldError(k) ? 'border-danger focus:border-danger' : 'border-border focus:border-accent'}`

  return (
    <AuthShell aside={<ProductLifecycle variant="stack" uploadSamples={uploadSamples} mockupPhotos={mockupPhotos} />}>
      <div className="w-full max-w-sm space-y-6 pt-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-extrabold text-text-primary">Set up your studio</h1>
          <p className="text-sm text-muted">Just a few details and you're in — no waiting required.</p>
        </div>

        {checking ? (
          <div className="flex justify-center py-10">
            <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tokenError ? (
          <div className="bg-danger/10 border border-danger/30 rounded-2xl p-5 text-center space-y-3">
            <p className="text-sm text-danger">{tokenError}</p>
            <a href="/studio/login" className="inline-block text-sm text-accent hover:underline">← Back to login</a>
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
              <label className="text-xs font-medium text-muted">Studio name</label>
              <input
                type="text"
                value={studioName}
                onChange={(e) => setStudioName(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, studioName: true }))}
                placeholder="Ravi Clicks Studio"
                className={inputClass('studioName')}
              />
              {fieldError('studioName') && <p className="text-xs text-danger">{fieldError('studioName')}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted">Your name</label>
              <input
                type="text"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, adminName: true }))}
                placeholder="Ravi Kumar"
                className={inputClass('adminName')}
              />
              {fieldError('adminName') && <p className="text-xs text-danger">{fieldError('adminName')}</p>}
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

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted">Tell us about your studio <span className="text-muted font-normal">(optional)</span></label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="Type of events you shoot, number of clients per month, anything you'd like us to know…"
                className={`${inputBase} border-border focus:border-accent resize-none`}
              />
            </div>

            {submitError && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg px-3.5 py-2.5 text-sm text-danger">{submitError}</div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-accent text-bg font-bold py-2.5 rounded-xl text-sm hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Setting up…' : 'Setup Studio Free →'}
            </button>
          </form>
        )}
      </div>
    </AuthShell>
  )
}

export default function RegisterForm(props: Props) {
  return (
    <Suspense fallback={<AuthShell><div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin mt-20" /></AuthShell>}>
      <RegisterFormInner {...props} />
    </Suspense>
  )
}
