'use client'
import { useState } from 'react'

interface Props {
  subdomain: string
  message?: string
  accentColor: string
  textOnAccent?: string
}

const EVENT_TYPES = ['Wedding', 'Pre-Wedding', 'Engagement', 'Birthday', 'Corporate', 'Portrait', 'Other']

export default function BookingForm({ subdomain, message, accentColor, textOnAccent = '#fff' }: Props) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', eventType: '', eventDate: '', message: '' })
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.email) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`/studio/api/public/${subdomain}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      }).then(r => r.json())
      if (res.success) setDone(true)
      else setError(res.message ?? 'Something went wrong. Please try again.')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (done) return (
    <div className="text-center py-12">
      <div className="text-4xl mb-4">✓</div>
      <h3 className="text-xl font-bold mb-2">Thank you!</h3>
      <p className="text-sm opacity-70">We&apos;ve received your enquiry and will get back to you shortly.</p>
    </div>
  )

  return (
    <form onSubmit={submit} className="space-y-4 max-w-lg mx-auto">
      {message && <p className="text-sm opacity-70 text-center mb-6">{message}</p>}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold mb-1 opacity-60 uppercase tracking-wider">Name *</label>
          <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm outline-none focus:border-current placeholder-white/30"
            placeholder="Your name" />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1 opacity-60 uppercase tracking-wider">Email *</label>
          <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm outline-none focus:border-current placeholder-white/30"
            placeholder="your@email.com" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold mb-1 opacity-60 uppercase tracking-wider">Phone</label>
          <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm outline-none focus:border-current placeholder-white/30"
            placeholder="+91 98765 43210" />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1 opacity-60 uppercase tracking-wider">Event type</label>
          <select value={form.eventType} onChange={e => setForm(f => ({ ...f, eventType: e.target.value }))}
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm outline-none focus:border-current">
            <option value="">Select…</option>
            {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1 opacity-60 uppercase tracking-wider">Event date</label>
        <input type="date" value={form.eventDate} onChange={e => setForm(f => ({ ...f, eventDate: e.target.value }))}
          className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm outline-none focus:border-current" />
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1 opacity-60 uppercase tracking-wider">Message</label>
        <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
          rows={3} className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm outline-none focus:border-current placeholder-white/30 resize-none"
          placeholder="Tell us about your event…" />
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button type="submit" disabled={loading}
        style={{ backgroundColor: accentColor, color: textOnAccent }}
        className="w-full font-bold py-3.5 rounded-xl text-sm transition-opacity disabled:opacity-60">
        {loading ? 'Sending…' : 'Send Enquiry'}
      </button>
    </form>
  )
}
