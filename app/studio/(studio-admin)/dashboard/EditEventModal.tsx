'use client'

import { useState, useEffect } from 'react'
import type { StudioProject, EventType } from '@/types/studio'

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'WEDDING',     label: 'Wedding' },
  { value: 'MEHENDI',     label: 'Mehendi' },
  { value: 'RECEPTION',   label: 'Reception' },
  { value: 'ENGAGEMENT',  label: 'Engagement' },
  { value: 'PRE_WEDDING', label: 'Pre-Wedding' },
  { value: 'BIRTHDAY',    label: 'Birthday' },
  { value: 'CORPORATE',   label: 'Corporate' },
  { value: 'SCHOOL',      label: 'School' },
  { value: 'OTHER',       label: 'Other' },
]

interface Props {
  project: StudioProject
  onClose: () => void
  onSaved: () => void
}

export default function EditEventModal({ project, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    clientName:    project.clientName,
    clientEmail:   project.clientEmail  ?? '',
    clientPhone:   project.clientPhone  ?? '',
    eventDate:     project.eventDate,
    eventType:     project.eventType,
    eventLocation: project.eventLocation ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const save = async () => {
    if (!form.clientName || !form.eventDate || !form.eventType) return
    setSaving(true); setError('')
    try {
      const res = await fetch(`/studio/api/admin/projects/${project.projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      }).then(r => r.json())
      if (!res.success) { setError(res.message ?? 'Save failed'); return }
      onSaved()
      onClose()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">Edit Event</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-text-primary hover:bg-border/60 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Event Type pills */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted uppercase tracking-wider">Event Type</label>
            <div className="grid grid-cols-3 gap-1.5">
              {EVENT_TYPES.map(et => (
                <button key={et.value} type="button" onClick={() => setForm(p => ({ ...p, eventType: et.value }))}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-colors text-center ${
                    form.eventType === et.value
                      ? 'bg-accent/15 border-accent/50 text-accent'
                      : 'border-border text-muted hover:border-border/80 hover:text-text-primary hover:bg-border/30'
                  }`}
                >
                  {et.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date + Location */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Event Date</label>
              <input type="date" value={form.eventDate} onChange={f('eventDate')} required
                className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent/60 transition-colors" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Location <span className="normal-case font-normal text-muted/60">(optional)</span></label>
              <input type="text" value={form.eventLocation} onChange={f('eventLocation')} placeholder="Venue / City"
                className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-muted/50 focus:outline-none focus:border-accent/60 transition-colors" />
            </div>
          </div>

          {/* Client info */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted uppercase tracking-wider">Client Name</label>
            <input type="text" value={form.clientName} onChange={f('clientName')} required
              className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent/60 transition-colors" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Email</label>
              <input type="email" value={form.clientEmail} onChange={f('clientEmail')} placeholder="client@email.com"
                className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-muted/50 focus:outline-none focus:border-accent/60 transition-colors" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Phone</label>
              <input type="tel" value={form.clientPhone} onChange={f('clientPhone')} placeholder="+91 XXXXX XXXXX"
                className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-muted/50 focus:outline-none focus:border-accent/60 transition-colors" />
            </div>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text-primary hover:bg-border/40 transition-colors">
              Cancel
            </button>
            <button onClick={save} disabled={saving || !form.clientName || !form.eventDate}
              className="flex-1 py-2.5 rounded-xl bg-accent text-bg text-sm font-bold hover:bg-accent/90 disabled:opacity-60 transition-colors">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
