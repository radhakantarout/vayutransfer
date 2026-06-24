'use client'

import { useState } from 'react'
import Link from 'next/link'

type Field = { label: string; key: string; type: string; placeholder: string; required: boolean }

const FIELDS: Field[] = [
  { label: 'Studio Name',   key: 'studioName', type: 'text',  placeholder: 'e.g. Arjun Photography',          required: true  },
  { label: 'Your Name',     key: 'adminName',  type: 'text',  placeholder: 'Your full name',                   required: true  },
  { label: 'Email',         key: 'email',      type: 'email', placeholder: 'your@email.com',                   required: true  },
  { label: 'Phone',         key: 'phone',      type: 'tel',   placeholder: '+91 98765 43210',                  required: true  },
  { label: 'About your work', key: 'message',  type: 'textarea', placeholder: 'Weddings, portraits, events…', required: false },
]

export default function RegisterPage() {
  const [form, setForm]     = useState({ studioName: '', adminName: '', email: '', phone: '', message: '' })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]     = useState(false)
  const [error, setError]   = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res  = await fetch('/studio/api/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError('Something went wrong. Please try again.')
      } else {
        setDone(true)
      }
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-success/10 border border-success/30 flex items-center justify-center mx-auto text-3xl">
            ✓
          </div>
          <h1 className="text-2xl font-extrabold text-text-primary">Request received!</h1>
          <p className="text-muted leading-relaxed">
            We&apos;ll review your request and get back to you within 24 hours.
            Your login credentials will be sent to <strong className="text-text-primary">{form.email}</strong>.
          </p>
          <Link
            href="/studio/home"
            className="inline-flex items-center gap-2 text-sm text-accent hover:text-accent/80 transition-colors"
          >
            ← Back to VayuStudio
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-14">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-full px-3 py-1 text-accent text-xs font-semibold mb-4">
            Free to get started
          </div>
          <h1 className="text-3xl font-extrabold text-text-primary leading-tight">
            Register your studio
          </h1>
          <p className="text-muted text-sm mt-2">
            Fill in your details and we&apos;ll set up your VayuStudio account. Usually approved within 24 hours.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {FIELDS.map(({ label, key, type, placeholder, required }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                {label}
                {required && <span className="text-danger ml-1">*</span>}
              </label>
              {type === 'textarea' ? (
                <textarea
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  rows={3}
                  className="w-full bg-bg border border-border rounded-xl px-3.5 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors resize-none"
                />
              ) : (
                <input
                  type={type}
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  required={required}
                  className="w-full bg-bg border border-border rounded-xl px-3.5 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors"
                />
              )}
            </div>
          ))}

          {error && (
            <p className="text-sm text-danger font-medium">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-accent text-bg font-bold py-3.5 rounded-xl text-base hover:bg-accent/90 transition-colors disabled:opacity-60 mt-2"
          >
            {submitting ? 'Submitting…' : 'Submit registration request'}
          </button>
        </form>

        {/* Footer link */}
        <p className="text-center text-sm text-muted mt-6">
          Already have an account?{' '}
          <Link href="/studio/login" className="text-accent hover:text-accent/80 font-semibold transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
