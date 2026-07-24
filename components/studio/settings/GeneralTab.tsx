'use client'

import { useState } from 'react'

// UI-only mockup — local state, no persistence yet.
export default function GeneralTab() {
  const [studioName, setStudioName] = useState('Rk Studio')
  const [contactEmail, setContactEmail] = useState('hello@rkstudio.in')
  const [contactPhone, setContactPhone] = useState('98765 43210')
  const [timezone, setTimezone] = useState('Asia/Kolkata (IST)')
  const [currency, setCurrency] = useState('INR (₹)')
  const [saved, setSaved] = useState(false)

  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 2000) }

  return (
    <div className="max-w-lg space-y-6">
      <section className="space-y-3">
        <h4 className="text-xs font-bold text-muted uppercase tracking-wider">Studio profile</h4>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted">Studio name</label>
            <input value={studioName} onChange={e => setStudioName(e.target.value)}
              className="w-full bg-bg border border-border rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent/60 transition-colors" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">Contact email</label>
              <input value={contactEmail} onChange={e => setContactEmail(e.target.value)}
                className="w-full bg-bg border border-border rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent/60 transition-colors" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">Contact phone</label>
              <input value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                className="w-full bg-bg border border-border rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent/60 transition-colors" />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-bold text-muted uppercase tracking-wider">Regional</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted">Timezone</label>
            <select value={timezone} onChange={e => setTimezone(e.target.value)}
              className="w-full bg-bg border border-border rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent/60 transition-colors">
              <option>Asia/Kolkata (IST)</option>
              <option>Asia/Dubai (GST)</option>
              <option>UTC</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted">Currency</label>
            <select value={currency} onChange={e => setCurrency(e.target.value)}
              className="w-full bg-bg border border-border rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent/60 transition-colors">
              <option>INR (₹)</option>
              <option>USD ($)</option>
              <option>AED (د.إ)</option>
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-bold text-muted uppercase tracking-wider">Notifications</h4>
        <div className="space-y-2">
          {[
            { label: 'Email me when a client submits their selection', defaultOn: true },
            { label: 'Email me when storage crosses 80%', defaultOn: true },
            { label: 'Email me a weekly activity summary', defaultOn: false },
          ].map((item, i) => (
            <ToggleRow key={i} label={item.label} defaultOn={item.defaultOn} />
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3 pt-2">
        <button onClick={save}
          className="bg-accent text-bg text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-accent/90 active:scale-[0.98] transition-all">
          Save changes
        </button>
        {saved && <span className="text-xs text-success font-semibold">Saved!</span>}
      </div>
    </div>
  )
}

function ToggleRow({ label, defaultOn }: { label: string; defaultOn: boolean }) {
  const [on, setOn] = useState(defaultOn)
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
      <span className="text-sm text-text-primary">{label}</span>
      <button type="button" onClick={() => setOn(v => !v)}
        className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-border'}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : ''}`} />
      </button>
    </label>
  )
}
