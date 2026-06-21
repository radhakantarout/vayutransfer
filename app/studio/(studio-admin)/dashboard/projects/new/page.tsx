'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const EVENT_TYPES = ['WEDDING', 'PRE_WEDDING', 'CORPORATE', 'SCHOOL', 'OTHER']

export default function NewProjectPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    clientName: '', clientEmail: '', clientPhone: '', eventDate: '', eventType: 'WEDDING',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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

  return (
    <div className="max-w-xl mx-auto px-6 py-10">
      <div className="mb-8">
        <button onClick={() => router.back()} className="text-sm text-muted hover:text-text-primary transition-colors mb-4 flex items-center gap-1">
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-text-primary">New Project</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-8 space-y-5">
        {[
          { label: 'Client name', key: 'clientName', type: 'text', required: true, placeholder: 'Priya & Ravi' },
          { label: 'Client email', key: 'clientEmail', type: 'email', required: false, placeholder: 'priya@gmail.com' },
          { label: 'Client phone', key: 'clientPhone', type: 'tel', required: false, placeholder: '9876543210' },
          { label: 'Event date', key: 'eventDate', type: 'date', required: true, placeholder: '' },
        ].map(({ label, key, type, required, placeholder }) => (
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

        <div className="space-y-1.5">
          <label className="text-sm text-muted">Event type <span className="text-danger">*</span></label>
          <select
            value={form.eventType}
            onChange={(e) => set('eventType', e.target.value)}
            className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent"
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace('_', ' ')}</option>
            ))}
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
