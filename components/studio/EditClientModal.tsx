'use client'

import { useState, useEffect } from 'react'
import type { StudioProject } from '@/types/studio'

interface Props {
  projects: StudioProject[]  // all events belonging to this client
  onClose: () => void
  onSaved: () => void
}

// Bulk-edits contact info across every event a client has — renaming here
// updates the sidebar grouping everywhere at once instead of the admin
// re-editing each event individually.
export default function EditClientModal({ projects, onClose, onSaved }: Props) {
  const original = projects[0]
  const [form, setForm] = useState({
    clientName:  original.clientName,
    clientEmail: original.clientEmail ?? '',
    clientPhone: original.clientPhone ?? '',
  })
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [nameError, setNameError]   = useState('')
  const [emailError, setEmailError] = useState('')
  const [phoneError, setPhoneError] = useState('')

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
  const validateName = (v: string) => {
    if (v.trim().length < 2) setNameError('Name must be at least 2 characters')
    else setNameError('')
  }

  const save = async () => {
    const nameErr  = form.clientName.trim().length < 2 ? 'Name must be at least 2 characters' : ''
    const emailErr = form.clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.clientEmail.trim()) ? 'Enter a valid email address' : ''
    const phoneErr = form.clientPhone && !/^(\+91[\s-]?|0)?[6-9]\d{9}$/.test(form.clientPhone.trim()) ? 'Enter a valid 10-digit Indian mobile number (e.g. 98765 43210)' : ''
    if (nameErr)  setNameError(nameErr)
    if (emailErr) setEmailError(emailErr)
    if (phoneErr) setPhoneError(phoneErr)
    if (nameErr || emailErr || phoneErr) return
    setSaving(true); setError('')
    try {
      const res = await fetch(`/studio/api/admin/clients/${encodeURIComponent(original.clientName)}`, {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-text-primary">Edit client info</h2>
            <p className="text-xs text-muted mt-0.5">Updates all {projects.length} event{projects.length !== 1 ? 's' : ''} for this client</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-text-primary hover:bg-border/60 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted uppercase tracking-wider">Client Name</label>
            <input type="text" value={form.clientName}
              onChange={e => { setForm(p => ({ ...p, clientName: e.target.value })); setNameError('') }}
              onBlur={e => validateName(e.target.value)}
              required
              className={`w-full bg-bg border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none transition-colors ${nameError ? 'border-danger focus:border-danger' : 'border-border focus:border-accent/60'}`} />
            {nameError && <p className="text-[10px] text-danger">{nameError}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Email</label>
              <input type="email" value={form.clientEmail}
                onChange={e => { setForm(p => ({ ...p, clientEmail: e.target.value })); setEmailError('') }}
                onBlur={e => validateEmail(e.target.value)}
                placeholder="client@email.com"
                className={`w-full bg-bg border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-muted/50 focus:outline-none transition-colors ${emailError ? 'border-danger focus:border-danger' : 'border-border focus:border-accent/60'}`} />
              {emailError && <p className="text-[10px] text-danger">{emailError}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Phone</label>
              <input type="tel" value={form.clientPhone}
                onChange={e => { setForm(p => ({ ...p, clientPhone: e.target.value })); setPhoneError('') }}
                onBlur={e => validatePhone(e.target.value)}
                placeholder="+91 XXXXX XXXXX"
                className={`w-full bg-bg border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-muted/50 focus:outline-none transition-colors ${phoneError ? 'border-danger focus:border-danger' : 'border-border focus:border-accent/60'}`} />
              {phoneError && <p className="text-[10px] text-danger">{phoneError}</p>}
            </div>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text-primary hover:bg-border/40 transition-colors">
              Cancel
            </button>
            <button onClick={save} disabled={saving || !form.clientName}
              className="flex-1 py-2.5 rounded-xl bg-accent text-bg text-sm font-bold hover:bg-accent/90 disabled:opacity-60 transition-colors">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
