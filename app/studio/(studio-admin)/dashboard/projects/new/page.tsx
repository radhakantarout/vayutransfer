'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const EVENT_TYPES = ['WEDDING', 'PRE_WEDDING', 'CORPORATE', 'SCHOOL', 'OTHER']

function validateEmail(v: string) {
  if (!v) return ''
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : 'Enter a valid email address'
}
function validatePhone(v: string) {
  if (!v) return ''
  return /^(\+91[\s-]?|0)?[6-9]\d{9}$/.test(v.trim()) ? '' : 'Enter a valid 10-digit Indian mobile number (e.g. 98765 43210)'
}

export default function NewProjectPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    clientName: '', clientEmail: '', clientPhone: '', eventDate: '', eventType: 'WEDDING',
  })
  const [errors, setErrors]   = useState({ clientName: '', clientEmail: '', clientPhone: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const set = (k: string, v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: '' }))
  }

  const blurValidate = (k: string, v: string) => {
    if (k === 'clientName')  setErrors(e => ({ ...e, clientName:  v.trim().length < 2 ? 'Name must be at least 2 characters' : '' }))
    if (k === 'clientEmail') setErrors(e => ({ ...e, clientEmail: validateEmail(v) }))
    if (k === 'clientPhone') setErrors(e => ({ ...e, clientPhone: validatePhone(v) }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const nameErr  = form.clientName.trim().length < 2 ? 'Name must be at least 2 characters' : ''
    const emailErr = validateEmail(form.clientEmail)
    const phoneErr = validatePhone(form.clientPhone)
    if (nameErr || emailErr || phoneErr) {
      setErrors({ clientName: nameErr, clientEmail: emailErr, clientPhone: phoneErr })
      return
    }
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/studio/api/admin/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!data.success) { setError(data.message ?? 'Failed to create project'); return }
      router.push(`/studio/dashboard/projects/${data.data.projectId}`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  const field = (label: string, k: keyof typeof form, type: string, required: boolean, placeholder: string) => (
    <div key={k} className="space-y-1.5">
      <label className="text-sm text-muted">{label}{required && <span className="text-danger ml-0.5">*</span>}</label>
      <input
        type={type}
        value={form[k]}
        onChange={e => set(k, e.target.value)}
        onBlur={e => blurValidate(k, e.target.value)}
        required={required}
        placeholder={placeholder}
        className={`w-full bg-bg border rounded-lg px-4 py-3 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent transition-colors ${errors[k as keyof typeof errors] ? 'border-danger' : 'border-border'}`}
      />
      {errors[k as keyof typeof errors] && (
        <p className="text-xs text-danger flex items-center gap-1">
          <span>⚠</span> {errors[k as keyof typeof errors]}
        </p>
      )}
    </div>
  )

  return (
    <div className="max-w-xl mx-auto px-6 py-10">
      <div className="mb-8">
        <button onClick={() => router.back()} className="text-sm text-muted hover:text-text-primary transition-colors mb-4 flex items-center gap-1">
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-text-primary">New Project</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-8 space-y-5">
        {field('Client name', 'clientName', 'text',  true,  'Priya & Ravi')}
        {field('Client email', 'clientEmail', 'email', false, 'priya@gmail.com')}
        {field('Client phone', 'clientPhone', 'tel',   false, '9876543210')}

        {/* Date — constrained width so it doesn't stretch */}
        <div className="space-y-1.5">
          <label className="text-sm text-muted">Event date <span className="text-danger">*</span></label>
          <input
            type="date"
            value={form.eventDate}
            onChange={e => set('eventDate', e.target.value)}
            required
            className="w-48 bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm text-muted">Event type <span className="text-danger">*</span></label>
          <select
            value={form.eventType}
            onChange={e => set('eventType', e.target.value)}
            className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent"
          >
            {EVENT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent text-bg font-bold py-3 rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          {loading ? 'Creating…' : 'Create Project'}
        </button>
      </form>
    </div>
  )
}
