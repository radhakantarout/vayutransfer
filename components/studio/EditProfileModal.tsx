'use client'

import { useState } from 'react'

interface Props {
  initialName: string
  initialPhone: string
  onClose: () => void
  onSaved: (name: string) => void
}

export default function EditProfileModal({ initialName, initialPhone, onClose, onSaved }: Props) {
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState(initialPhone)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError(null)
    const res = await fetch('/studio/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
    }).then(r => r.json()).catch(() => ({ success: false }))
    setSaving(false)
    if (res.success) onSaved(name.trim())
    else setError('Failed to save. Please try again.')
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">Edit profile</h2>
          <button onClick={onClose} className="text-muted hover:text-text-primary transition-colors text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted">Name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full mt-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted">Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full mt-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent" />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button onClick={save} disabled={saving}
            className="w-full bg-accent text-bg text-sm font-bold py-2.5 rounded-xl hover:bg-accent/90 disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
