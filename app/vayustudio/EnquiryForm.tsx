'use client'

import { useState } from 'react'

export default function EnquiryForm() {
  const [form, setForm] = useState({ name: '', studioName: '', email: '', phone: '', message: '' })
  const [loading, setLoading]  = useState(false)
  const [success, setSuccess]  = useState(false)
  const [error, setError]      = useState<string | null>(null)

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/vayustudio/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      }).then((r) => r.json())
      if (!res.success) { setError('Something went wrong. Please try WhatsApp below.'); return }
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
      <div className="text-muted text-sm">We'll reach out to {form.email} within 24 hours to set up your studio.</div>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-8 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {[
          { label: 'Your name',    key: 'name',        type: 'text',  placeholder: 'Ravi Kumar',         required: true  },
          { label: 'Studio name',  key: 'studioName',  type: 'text',  placeholder: 'Ravi Clicks Studio', required: true  },
          { label: 'Email',        key: 'email',        type: 'email', placeholder: 'ravi@raviphotos.com', required: true  },
          { label: 'Phone',        key: 'phone',        type: 'tel',   placeholder: '9876543210',          required: true  },
        ].map(({ label, key, type, placeholder, required }) => (
          <div key={key} className="space-y-1.5">
            <label className="text-sm text-muted">{label}{required && <span className="text-danger ml-0.5">*</span>}</label>
            <input
              type={type}
              value={form[key as keyof typeof form]}
              onChange={(e) => set(key, e.target.value)}
              required={required}
              placeholder={placeholder}
              className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </div>
        ))}
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
        <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">{error}</div>
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
