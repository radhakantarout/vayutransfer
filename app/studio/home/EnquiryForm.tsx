'use client'

import { useState } from 'react'

function validateEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

function validatePhone(digits: string) {
  return /^[6-9]\d{9}$/.test(digits.trim())
}

export default function EnquiryForm() {
  const [form, setForm] = useState({ name: '', studioName: '', email: '', phoneDigits: '', message: '' })
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [loading, setLoading]  = useState(false)
  const [success, setSuccess]  = useState(false)
  const [error, setError]      = useState<string | null>(null)
  const [emailExists, setEmailExists] = useState(false)

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }))

  const fieldError = (k: string): string | null => {
    if (!touched[k]) return null
    switch (k) {
      case 'name':       return form.name.trim().length < 2 ? 'Please enter your full name' : null
      case 'studioName': return form.studioName.trim().length < 2 ? 'Please enter your studio name' : null
      case 'email':      return !validateEmail(form.email) ? 'Enter a valid email address' : null
      case 'phoneDigits':
        if (!form.phoneDigits.trim()) return 'Phone number is required'
        if (!/^\d+$/.test(form.phoneDigits.trim())) return 'Enter digits only (no spaces or dashes)'
        if (!validatePhone(form.phoneDigits)) return 'Enter a valid 10-digit Indian mobile number'
        return null
      default: return null
    }
  }

  const isFormValid =
    form.name.trim().length >= 2 &&
    form.studioName.trim().length >= 2 &&
    validateEmail(form.email) &&
    validatePhone(form.phoneDigits)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ name: true, studioName: true, email: true, phoneDigits: true })
    if (!isFormValid) return
    setError(null)
    setEmailExists(false)
    setLoading(true)
    try {
      const res = await fetch('/api/vayustudio/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:      form.name.trim(),
          studioName: form.studioName.trim(),
          email:     form.email.trim(),
          phone:     `+91${form.phoneDigits.trim()}`,
          message:   form.message.trim(),
        }),
      }).then((r) => r.json())
      if (!res.success) {
        if (res.error === 'EMAIL_EXISTS') {
          setEmailExists(true)
          setError('An account with this email already exists.')
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
      <div className="text-text-primary font-bold text-lg">We&apos;ve got your request!</div>
      <div className="text-muted text-sm">We&apos;ll reach out to {form.email} within 24 hours to set up your studio.</div>
    </div>
  )

  const inputBase = "w-full bg-bg border rounded-lg px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none transition-colors"

  return (
    <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-8 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

        {/* Name */}
        <div className="space-y-1.5">
          <label className="text-sm text-muted">Your name <span className="text-danger">*</span></label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            onBlur={() => touch('name')}
            placeholder="Ravi Kumar"
            className={`${inputBase} ${fieldError('name') ? 'border-danger focus:border-danger' : 'border-border focus:border-accent'}`}
          />
          {fieldError('name') && <p className="text-xs text-danger">{fieldError('name')}</p>}
        </div>

        {/* Studio name */}
        <div className="space-y-1.5">
          <label className="text-sm text-muted">Studio name <span className="text-danger">*</span></label>
          <input
            type="text"
            value={form.studioName}
            onChange={(e) => set('studioName', e.target.value)}
            onBlur={() => touch('studioName')}
            placeholder="Ravi Clicks Studio"
            className={`${inputBase} ${fieldError('studioName') ? 'border-danger focus:border-danger' : 'border-border focus:border-accent'}`}
          />
          {fieldError('studioName') && <p className="text-xs text-danger">{fieldError('studioName')}</p>}
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <label className="text-sm text-muted">Email <span className="text-danger">*</span></label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            onBlur={() => touch('email')}
            placeholder="ravi@raviphotos.com"
            className={`${inputBase} ${fieldError('email') ? 'border-danger focus:border-danger' : 'border-border focus:border-accent'}`}
          />
          {fieldError('email') && <p className="text-xs text-danger">{fieldError('email')}</p>}
        </div>

        {/* Phone with +91 prefix */}
        <div className="space-y-1.5">
          <label className="text-sm text-muted">Phone <span className="text-danger">*</span></label>
          <div className={`flex items-center border rounded-lg overflow-hidden focus-within:outline-none transition-colors ${fieldError('phoneDigits') ? 'border-danger' : 'border-border focus-within:border-accent'}`}>
            <span className="bg-muted/10 text-muted text-sm px-3 py-3 border-r border-border select-none whitespace-nowrap">+91</span>
            <input
              type="tel"
              value={form.phoneDigits}
              onChange={(e) => set('phoneDigits', e.target.value.replace(/\D/g, '').slice(0, 10))}
              onBlur={() => touch('phoneDigits')}
              placeholder="9876543210"
              maxLength={10}
              className="flex-1 bg-bg px-3 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none"
            />
          </div>
          {fieldError('phoneDigits') && <p className="text-xs text-danger">{fieldError('phoneDigits')}</p>}
        </div>

      </div>

      {/* Message */}
      <div className="space-y-1.5">
        <label className="text-sm text-muted">Tell us about your studio <span className="text-muted font-normal">(optional)</span></label>
        <textarea
          value={form.message}
          onChange={(e) => set('message', e.target.value)}
          rows={3}
          placeholder="Type of events you shoot, number of clients per month, anything you'd like us to know…"
          className={`${inputBase} border-border focus:border-accent resize-none`}
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
