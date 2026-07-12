'use client'

import { useState } from 'react'
import type { StudioProject } from '@/types/studio'

const SCHEDULE_DAYS = [7, 15, 30, 45]

interface Props {
  projects: StudioProject[]  // length 1 for a single event, >1 for "delete all events for this client"
  onClose: () => void
  onDeleted: () => void
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function DeleteProjectModal({ projects, onClose, onDeleted }: Props) {
  const [mode, setMode]         = useState<'now' | 'schedule'>('schedule')
  const [days, setDays]         = useState(7)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState('')

  const isSingle = projects.length === 1
  const clientName = projects[0].clientName
  const label = isSingle
    ? `${clientName} — ${projects[0].eventType.replace(/_/g, ' ')}`
    : `${clientName} (${projects.length} events)`
  const runsOn = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

  const handleConfirm = async () => {
    setError('')
    if (mode === 'now' && confirmText.trim() !== clientName) {
      setError(`Type "${clientName}" exactly to confirm.`)
      return
    }
    setBusy(true)
    try {
      if (mode === 'now') {
        const results = await Promise.allSettled(
          projects.map(p => fetch(`/studio/api/admin/projects/${p.projectId}`, { method: 'DELETE' }).then(r => r.json()))
        )
        const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length
        if (failed > 0 && failed === projects.length) {
          setError('Failed to delete. Please try again.')
          return
        }
      } else {
        const scheduledDeleteAt = runsOn.toISOString()
        const results = await Promise.allSettled(
          projects.map(p =>
            fetch(`/studio/api/admin/projects/${p.projectId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ scheduledDeleteAt }),
            }).then(r => r.json())
          )
        )
        const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length
        if (failed > 0 && failed === projects.length) {
          setError('Failed to schedule deletion. Please try again.')
          return
        }
      }
      onDeleted()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">Delete {isSingle ? 'event' : 'events'}?</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-text-primary hover:bg-border/60 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-text-primary truncate">{label}</p>

          <div className="space-y-2">
            <button onClick={() => setMode('schedule')}
              className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${mode === 'schedule' ? 'border-accent/50 bg-accent/10' : 'border-border hover:bg-border/30'}`}>
              <div className="flex items-center gap-2">
                <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${mode === 'schedule' ? 'border-accent bg-accent' : 'border-muted'}`} />
                <span className="text-sm font-semibold text-text-primary">Schedule delete</span>
              </div>
              {mode === 'schedule' && (
                <div className="mt-2.5 ml-5 space-y-2">
                  <div className="flex gap-1.5">
                    {SCHEDULE_DAYS.map(d => (
                      <button key={d} type="button" onClick={() => setDays(d)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                          days === d ? 'bg-accent/15 border-accent/50 text-accent' : 'border-border text-muted hover:border-border/80'
                        }`}>
                        {d} days
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted">Runs automatically on {fmtDate(runsOn.toISOString())}. You can cancel anytime before then.</p>
                </div>
              )}
            </button>

            <button onClick={() => setMode('now')}
              className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${mode === 'now' ? 'border-danger/50 bg-danger/10' : 'border-border hover:bg-border/30'}`}>
              <div className="flex items-center gap-2">
                <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${mode === 'now' ? 'border-danger bg-danger' : 'border-muted'}`} />
                <span className="text-sm font-semibold text-text-primary">Delete now</span>
              </div>
              {mode === 'now' && (
                <div className="mt-2.5 ml-5 space-y-2">
                  <p className="text-[11px] text-danger">Permanent — cannot be undone. Type <strong>{clientName}</strong> to confirm.</p>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    placeholder={clientName}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-muted/50 focus:outline-none focus:border-danger/60 transition-colors"
                  />
                </div>
              )}
            </button>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text-primary hover:bg-border/40 transition-colors">
              Cancel
            </button>
            <button onClick={handleConfirm} disabled={busy || (mode === 'now' && confirmText.trim() !== clientName)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 transition-colors ${
                mode === 'now' ? 'bg-danger text-white hover:bg-danger/90' : 'bg-accent text-bg hover:bg-accent/90'
              }`}>
              {busy ? 'Working…' : mode === 'now' ? 'Delete now' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
