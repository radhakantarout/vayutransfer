'use client'

import { useState, useEffect } from 'react'
import { useSession, signIn } from 'next-auth/react'

// Gated behind a real NextAuth session (Google or email-OTP — both verify
// the email before a session can exist) since 2026-09-30. Previously this
// form let anyone POST any string as "email" with zero verification, which
// made /api/vayustudio/enquiry a magnet for bot spam (random-string
// enquiries, real SES cost per submission, no way to tell a real prospect
// from noise). The email a submission is filed under now comes only from
// the verified session server-side, never from this form — see the API
// route's own comment for the full reasoning.
export default function EnquiryForm() {
  const { data: session, status } = useSession()
  const [form, setForm] = useState({ name: '', studioName: '', phone: '', message: '' })
  const [loading, setLoading]  = useState(false)
  const [success, setSuccess]  = useState(false)
  const [error, setError]      = useState<string | null>(null)
  const [emailExists, setEmailExists] = useState(false)

  // Prefills "Your name" from the verified Google/OTP profile once
  // available — purely a convenience, not a security boundary (name stays
  // freely editable, only email is locked).
  useEffect(() => {
    if (session?.user?.name && !form.name) setForm((f) => ({ ...f, name: session.user!.name! }))
  }, [session, form.name])

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setEmailExists(false)
    setLoading(true)
    try {
      const res = await fetch('/api/vayustudio/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      }).then((r) => r.json())
      if (!res.success) {
        if (res.error === 'EMAIL_EXISTS') {
          setEmailExists(true)
          setError('An account with this email already exists.')
        } else if (res.error === 'UNAUTHENTICATED') {
          setError('Your session expired — please sign in again below.')
        } else {
          setError('Something went wrong. Please try WhatsApp below.')
        }
        return
      }
      setSuccess(true)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) return (
    <div className="bg-success/10 border border-success/30 rounded-2xl p-8 text-center space-y-3">
      <div className="text-4xl">✅</div>
      <div className="text-text-primary font-bold text-lg">We've got your request!</div>
      <div className="text-muted text-sm">We'll reach out to {session?.user?.email} within 24 hours to set up your studio.</div>
    </div>
  )

  if (status === 'loading') return (
    <div className="bg-card border border-border rounded-2xl p-8 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (status !== 'authenticated') return (
    <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-4">
      <div className="text-3xl">🔒</div>
      <div className="text-text-primary font-bold text-lg">Verify your email to continue</div>
      <p className="text-muted text-sm">To keep enquiries genuine (and stop spam), please sign in first — takes a few seconds, no password needed.</p>
      <button
        onClick={() => signIn('google')}
        className="w-full bg-accent text-bg font-bold py-3.5 rounded-xl hover:bg-accent/90 transition-colors text-sm"
      >
        Continue with Google
      </button>
      <p className="text-xs text-muted">
        Or reach us directly at{' '}
        <a href="mailto:support@vayutransfer.com" className="text-accent hover:underline">support@vayutransfer.com</a>
      </p>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-8 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <label className="text-sm text-muted">Your name<span className="text-danger ml-0.5">*</span></label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
            placeholder="Ravi Kumar"
            className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm text-muted">Studio name<span className="text-danger ml-0.5">*</span></label>
          <input
            type="text"
            value={form.studioName}
            onChange={(e) => set('studioName', e.target.value)}
            required
            placeholder="Ravi Clicks Studio"
            className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm text-muted flex items-center gap-1.5">Email <span className="text-success text-xs">✓ verified</span></label>
          <input
            type="email"
            value={session?.user?.email ?? ''}
            disabled
            className="w-full bg-bg/50 border border-border rounded-lg px-4 py-3 text-sm text-muted cursor-not-allowed"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm text-muted">Phone<span className="text-danger ml-0.5">*</span></label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            required
            placeholder="9876543210"
            className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm text-muted">Tell us about your studio <span className="text-muted font-normal">(optional)</span></label>
        <textarea
          value={form.message}
          onChange={(e) => set('message', e.target.value)}
          rows={3}
          placeholder="Type of events you shoot, number of clients per month, anything you'd like us to know…"
          className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent resize-none"
        />
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">
          {error}{' '}
          {emailExists && (
            <>
              Try a different email, or{' '}
              <a href="/studio/login" className="underline font-semibold">log in instead</a>.
            </>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-accent text-bg font-bold py-3.5 rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-50 text-sm"
      >
        {loading ? 'Sending…' : 'Request Studio Setup'}
      </button>

      <p className="text-xs text-muted text-center">
        We respond within 24 hours. Or reach us directly at{' '}
        <a href="mailto:support@vayutransfer.com" className="text-accent hover:underline">
          support@vayutransfer.com
        </a>
      </p>
    </form>
  )
}
