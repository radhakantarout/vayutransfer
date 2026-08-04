'use client'

import { useState, useEffect, useRef } from 'react'
import type { EventType, StudioProject } from '@/types/studio'

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
  clientName: string
  existingProjects: StudioProject[]  // to auto-fill email/phone
  onClose: () => void
  onCreated: (projectId: string) => void
}

export default function AddEventModal({ clientName, existingProjects, onClose, onCreated }: Props) {
  const existing = existingProjects.find((p) => p.clientName === clientName)
  // A brand-new client has a "shell" placeholder row with no real event yet
  // (created by New Project) — the first Add Event promotes it in place
  // instead of creating a second, duplicate row.
  const placeholder = existingProjects.find((p) => p.clientName === clientName && p.isPlaceholder)

  const [eventType, setEventType]       = useState<EventType>('WEDDING')
  const [eventDate, setEventDate]       = useState('')
  const [eventLocation, setLocation]   = useState('')
  const [clientEmail, setEmail]         = useState(existing?.clientEmail ?? '')
  const [clientPhone, setPhone]         = useState(existing?.clientPhone ?? '')
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState('')
  const [emailError, setEmailError]     = useState('')
  const [phoneError, setPhoneError]     = useState('')
  const overlayRef                      = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const validateEmail = (v: string) => {
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) setEmailError('Enter a valid email address')
    else setEmailError('')
  }
  const validatePhone = (v: string) => {
    if (v && !/^(\+91[\s-]?|0)?[6-9]\d{9}$/.test(v.trim())) setPhoneError('Enter a valid 10-digit Indian mobile number (e.g. 98765 43210)')
    else setPhoneError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!eventDate) { setError('Please pick an event date.'); return }
    const phoneErr = clientPhone && !/^(\+91[\s-]?|0)?[6-9]\d{9}$/.test(clientPhone.trim()) ? 'Enter a valid 10-digit Indian mobile number (e.g. 98765 43210)' : ''
    const emailErr = clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail.trim()) ? 'Enter a valid email address' : ''
    if (phoneErr) setPhoneError(phoneErr)
    if (emailErr) setEmailError(emailErr)
    if (phoneErr || emailErr) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(
        placeholder ? `/studio/api/admin/projects/${placeholder.projectId}` : '/studio/api/admin/projects',
        {
          method: placeholder ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientName, clientEmail, clientPhone, eventDate, eventType, eventLocation }),
        }
      )
      const data = await res.json()
      if (!data.success) { setError(data.message ?? 'Failed to create event.'); return }
      onCreated(placeholder ? placeholder.projectId : data.data.projectId)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-text-primary">Add Event</h2>
            <p className="text-xs text-muted mt-0.5">{clientName}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-text-primary hover:bg-border/60 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Event Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted uppercase tracking-wider">Event Type</label>
            <div className="grid grid-cols-3 gap-2">
              {EVENT_TYPES.map((et) => (
                <button
                  key={et.value}
                  type="button"
                  onClick={() => setEventType(et.value)}
                  className={`py-2 px-2 rounded-lg text-xs font-semibold border transition-colors text-center ${
                    eventType === et.value
                      ? 'bg-accent/15 border-accent/50 text-accent'
                      : 'border-border text-muted hover:border-border/80 hover:text-text-primary hover:bg-border/30'
                  }`}
                >
                  {et.label}
                </button>
              ))}
            </div>
          </div>

          {/* Event Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted uppercase tracking-wider">Event Date</label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              required
              className="w-48 bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent/60 transition-colors"
            />
          </div>

          {/* Event Location */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted uppercase tracking-wider">
              Event Location <span className="text-muted/60 normal-case font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={eventLocation}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Taj Hotel, Mumbai"
              className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-muted/50 focus:outline-none focus:border-accent/60 transition-colors"
            />
          </div>

          {/* Client contact — shown only if not already known */}
          {!existing && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted uppercase tracking-wider">Email</label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => { setEmail(e.target.value); setEmailError('') }}
                  onBlur={(e) => validateEmail(e.target.value)}
                  placeholder="client@email.com"
                  className={`w-full bg-bg border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-muted/50 focus:outline-none transition-colors ${emailError ? 'border-danger focus:border-danger' : 'border-border focus:border-accent/60'}`}
                />
                {emailError && <p className="text-[10px] text-danger">{emailError}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted uppercase tracking-wider">Phone</label>
                <input
                  type="tel"
                  value={clientPhone}
                  onChange={(e) => { setPhone(e.target.value); setPhoneError('') }}
                  onBlur={(e) => validatePhone(e.target.value)}
                  placeholder="+91 XXXXX XXXXX"
                  className={`w-full bg-bg border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-muted/50 focus:outline-none transition-colors ${phoneError ? 'border-danger focus:border-danger' : 'border-border focus:border-accent/60'}`}
                />
                {phoneError && <p className="text-[10px] text-danger">{phoneError}</p>}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-danger">{error}</p>}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text-primary hover:bg-border/40 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-accent text-bg text-sm font-bold hover:bg-accent/90 disabled:opacity-60 transition-colors"
            >
              {saving ? 'Creating…' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
