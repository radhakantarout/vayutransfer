'use client'
import { useState } from 'react'
import { translator } from '@/lib/studio/i18n'
import type { WebsiteLanguage } from '@/types/studio'

interface Props {
  subdomain: string
  message?: string
  accentColor: string
  textOnAccent?: string
  fontColor?: string
  language?: WebsiteLanguage
}

// Values submitted to the backend stay in English regardless of display
// language (matches whatever the admin Bookings dashboard already expects) —
// only the visible label in the dropdown is translated, via EVENT_TYPE_KEYS.
const EVENT_TYPES = ['Wedding', 'Pre-Wedding', 'Engagement', 'Birthday', 'Corporate', 'Portrait', 'Other']
const EVENT_TYPE_KEYS: Record<string, string> = {
  'Wedding': 'eventWedding', 'Pre-Wedding': 'eventPreWedding', 'Engagement': 'eventEngagement',
  'Birthday': 'eventBirthday', 'Corporate': 'eventCorporate', 'Portrait': 'eventPortrait', 'Other': 'eventOther',
}

function validateEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}
function validatePhone(v: string) {
  return !v || /^(\+91[\s-]?|0)?[6-9]\d{9}$/.test(v.trim())
}

export default function BookingForm({ subdomain, message, accentColor, textOnAccent = '#fff', fontColor, language }: Props) {
  const t = translator(language)
  const [form, setForm] = useState({ name: '', email: '', phone: '', eventType: '', eventDate: '', message: '' })
  const [fieldErrors, setFieldErrors] = useState({ name: '', email: '', phone: '' })
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const setField = (k: keyof typeof form, v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    setFieldErrors(e => ({ ...e, [k]: '' }))
  }

  const blurValidate = (k: string, v: string) => {
    if (k === 'name')  setFieldErrors(e => ({ ...e, name:  v.trim().length < 2 ? t('formErrName', 'Please enter your full name') : '' }))
    if (k === 'email') setFieldErrors(e => ({ ...e, email: !validateEmail(v) ? t('formErrEmail', 'Enter a valid email address') : '' }))
    if (k === 'phone') setFieldErrors(e => ({ ...e, phone: !validatePhone(v) ? t('formErrPhone', 'Enter a valid 10-digit Indian mobile number') : '' }))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const nameErr  = form.name.trim().length < 2 ? t('formErrName', 'Please enter your full name') : ''
    const emailErr = !validateEmail(form.email) ? t('formErrEmail', 'Enter a valid email address') : ''
    const phoneErr = !validatePhone(form.phone) ? t('formErrPhone', 'Enter a valid 10-digit Indian mobile number') : ''
    if (nameErr || emailErr || phoneErr) {
      setFieldErrors({ name: nameErr, email: emailErr, phone: phoneErr })
      return
    }
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
      <h3 className="text-xl font-bold mb-2">{t('formThankYouTitle', 'Thank you!')}</h3>
      <p className="text-sm opacity-70">{t('formThankYouBody', "We've received your enquiry and will get back to you shortly.")}</p>
    </div>
  )

  const fieldStyle = {
    borderColor: `${accentColor}60`,
    color: fontColor,
  }
  const labelStyle = { color: fontColor, opacity: 0.6 }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-lg mx-auto">
      {message && <p className="text-sm opacity-70 text-center mb-6">{message}</p>}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={labelStyle}>{t('formName', 'Name')} *</label>
          <input required value={form.name} onChange={e => setField('name', e.target.value)}
            className="w-full bg-white/10 border rounded-xl px-4 py-3 text-sm outline-none"
            style={{ ...fieldStyle, borderColor: fieldErrors.name ? '#ef4444' : `${accentColor}60`, outlineColor: accentColor }}
            onFocus={e => (e.currentTarget.style.borderColor = fieldErrors.name ? '#ef4444' : accentColor)}
            onBlur={e => { e.currentTarget.style.borderColor = fieldErrors.name ? '#ef4444' : `${accentColor}60`; blurValidate('name', e.target.value) }}
            placeholder={t('formNamePlaceholder', 'Your full name')} />
          {fieldErrors.name && <p className="text-[10px] text-red-400 mt-1">{fieldErrors.name}</p>}
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={labelStyle}>{t('formEmail', 'Email')} *</label>
          <input required type="email" value={form.email} onChange={e => setField('email', e.target.value)}
            className="w-full bg-white/10 border rounded-xl px-4 py-3 text-sm outline-none"
            style={{ ...fieldStyle, borderColor: fieldErrors.email ? '#ef4444' : `${accentColor}60`, outlineColor: accentColor }}
            onFocus={e => (e.currentTarget.style.borderColor = fieldErrors.email ? '#ef4444' : accentColor)}
            onBlur={e => { e.currentTarget.style.borderColor = fieldErrors.email ? '#ef4444' : `${accentColor}60`; blurValidate('email', e.target.value) }}
            placeholder="your@email.com" />
          {fieldErrors.email && <p className="text-[10px] text-red-400 mt-1">{fieldErrors.email}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={labelStyle}>{t('formPhone', 'Phone')}</label>
          <input value={form.phone} onChange={e => setField('phone', e.target.value)}
            className="w-full bg-white/10 border rounded-xl px-4 py-3 text-sm outline-none"
            style={{ ...fieldStyle, borderColor: fieldErrors.phone ? '#ef4444' : `${accentColor}60`, outlineColor: accentColor }}
            onFocus={e => (e.currentTarget.style.borderColor = fieldErrors.phone ? '#ef4444' : accentColor)}
            onBlur={e => { e.currentTarget.style.borderColor = fieldErrors.phone ? '#ef4444' : `${accentColor}60`; blurValidate('phone', e.target.value) }}
            placeholder="+91 98765 43210" />
          {fieldErrors.phone && <p className="text-[10px] text-red-400 mt-1">{fieldErrors.phone}</p>}
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={labelStyle}>{t('formEventType', 'Event type')}</label>
          <select value={form.eventType} onChange={e => setField('eventType', e.target.value)}
            className="w-full bg-white/10 border rounded-xl px-4 py-3 text-sm outline-none"
            style={{ ...fieldStyle, outlineColor: accentColor }}
            onFocus={e => (e.currentTarget.style.borderColor = accentColor)}
            onBlur={e => (e.currentTarget.style.borderColor = `${accentColor}60`)}>
            <option value="" style={{ color: '#1a1a1a' }}>{t('formSelectPlaceholder', 'Select…')}</option>
            {EVENT_TYPES.map(et => <option key={et} value={et} style={{ color: '#1a1a1a' }}>{t(EVENT_TYPE_KEYS[et], et)}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={labelStyle}>{t('formEventDate', 'Event date')}</label>
        <input type="date" value={form.eventDate} onChange={e => setField('eventDate', e.target.value)}
          className="w-48 bg-white/10 border rounded-xl px-4 py-3 text-sm outline-none"
          style={{ ...fieldStyle, outlineColor: accentColor }}
          onFocus={e => (e.currentTarget.style.borderColor = accentColor)}
          onBlur={e => (e.currentTarget.style.borderColor = `${accentColor}60`)} />
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={labelStyle}>{t('formMessage', 'Message')}</label>
        <textarea value={form.message} onChange={e => setField('message', e.target.value)}
          rows={3} className="w-full bg-white/10 border rounded-xl px-4 py-3 text-sm outline-none resize-none"
          style={{ ...fieldStyle, outlineColor: accentColor }}
          onFocus={e => (e.currentTarget.style.borderColor = accentColor)}
          onBlur={e => (e.currentTarget.style.borderColor = `${accentColor}60`)}
          placeholder={t('formMessagePlaceholder', 'Tell us about your event…')} />
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button type="submit" disabled={loading}
        style={{ backgroundColor: accentColor, color: textOnAccent }}
        className="w-full font-bold py-3.5 rounded-xl text-sm transition-opacity disabled:opacity-60">
        {loading ? t('formSubmitSending', 'Sending…') : t('formSubmit', 'Send Enquiry')}
      </button>
    </form>
  )
}
