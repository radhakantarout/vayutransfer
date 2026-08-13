'use client'

// Shared destination-picker modal — used for all three "which event" moments
// in the Raw Transfers redesign: choosing an upload target when multiple
// events are checked in the sidebar, and Move/Copy (which reuse this same
// component rather than a separate one, per spec). The picker itself never
// knows HOW to apply the choice — it just calls the supplied onChoose and
// shows its busy/error state, so upload-target (no mutation, just reports
// the chosen id back) and move/copy (actually PATCH/POST the transfer) can
// share one component even though only two of the three mutate anything.

import { useEffect, useState } from 'react'
import type { StudioProject, EventType } from '@/types/studio'

const EVENT_TYPES: EventType[] = ['WEDDING', 'MEHENDI', 'RECEPTION', 'ENGAGEMENT', 'PRE_WEDDING', 'BIRTHDAY', 'CORPORATE', 'SCHOOL', 'OTHER']

function EventIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  )
}

interface Props {
  title: string
  clientName: string
  clientEmail: string
  clientPhone: string
  // 'checked-events': tiles come straight from candidateProjects, no fetch —
  // used for the upload-target picker (sidebar's checked events).
  // 'same-client-siblings': fetched here, filtered to clientName, excluding
  // excludeProjectIds — used for Move/Copy, same query MoveCopyPhotoModal uses.
  mode: 'checked-events' | 'same-client-siblings'
  candidateProjects?: StudioProject[]
  excludeProjectIds?: string[]
  onClose: () => void
  onChoose: (targetProjectId: string) => Promise<{ success: boolean; message?: string }>
}

export default function TransferDestinationPicker({
  title, clientName, clientEmail, clientPhone, mode, candidateProjects, excludeProjectIds, onClose, onChoose,
}: Props) {
  const [fetchedEvents, setFetchedEvents] = useState<StudioProject[]>([])
  const [loading, setLoading] = useState(mode === 'same-client-siblings')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [newEventType, setNewEventType] = useState<EventType>('OTHER')
  const [newEventDate, setNewEventDate] = useState('')
  const [createBusy, setCreateBusy] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    if (mode !== 'same-client-siblings') return
    const excluded = new Set(excludeProjectIds ?? [])
    fetch('/studio/api/admin/projects').then(r => r.json()).then(d => {
      if (!d.success) { setLoading(false); return }
      const events = (d.data as StudioProject[]).filter(p =>
        p.clientName === clientName && !excluded.has(p.projectId) && !p.isPlaceholder
      )
      setFetchedEvents(events)
      setLoading(false)
    }).catch(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const events = mode === 'checked-events' ? (candidateProjects ?? []) : fetchedEvents

  const choose = async (targetProjectId: string) => {
    setBusyId(targetProjectId)
    setError('')
    const res = await onChoose(targetProjectId).catch(() => ({ success: false, message: 'Network error. Please try again.' }))
    if (!res.success) {
      setError(res.message ?? 'Something went wrong. Please try again.')
      setBusyId(null)
      return
    }
    onClose()
  }

  const createAndChoose = async () => {
    if (!newEventDate) { setError('Pick a date for the new event.'); return }
    setCreateBusy(true)
    setError('')
    try {
      const res = await fetch('/studio/api/admin/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName, clientEmail, clientPhone, eventDate: newEventDate, eventType: newEventType, eventLocation: '' }),
      }).then(r => r.json())
      if (!res.success) { setError(res.message ?? 'Could not create event.'); setCreateBusy(false); return }
      await choose(res.data.projectId)
    } catch {
      setError('Network error. Please try again.')
      setCreateBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-text-primary">{title}</h2>
            <p className="text-xs text-muted mt-0.5">{clientName}</p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-text-primary hover:bg-border/60 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-3 py-3 flex-1">
          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2.5 text-xs text-danger mb-3">{error}</div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-14">
              <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : events.length === 0 && !creating ? (
            <p className="text-sm text-muted text-center py-10">No other events yet — create one below.</p>
          ) : (
            <div className="space-y-1">
              {events.map(p => (
                <button
                  key={p.projectId}
                  onClick={() => choose(p.projectId)}
                  disabled={busyId !== null || createBusy}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-border/50 hover:-translate-y-px transition-all duration-150 disabled:opacity-50"
                >
                  <span className="w-8 h-8 flex-shrink-0 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
                    <EventIcon />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-text-primary truncate">{(p.eventType ?? '').replace(/_/g, ' ')}</div>
                    <div className="text-xs text-muted">
                      {new Date(p.eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' · '}{p.totalFiles ?? 0} photo{(p.totalFiles ?? 0) !== 1 ? 's' : ''}
                    </div>
                  </div>
                  {busyId === p.projectId && (
                    <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="mt-2 pt-2 border-t border-border">
            {!creating ? (
              <button
                onClick={() => setCreating(true)}
                disabled={busyId !== null}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-sm font-semibold text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Create new event
              </button>
            ) : (
              <div className="px-1 py-1 space-y-2.5">
                <select
                  value={newEventType}
                  onChange={(e) => setNewEventType(e.target.value as EventType)}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
                >
                  {EVENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
                <input
                  type="date"
                  value={newEventDate}
                  onChange={(e) => setNewEventDate(e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
                />
                <div className="flex gap-2">
                  <button onClick={() => { setCreating(false); setError('') }} disabled={createBusy}
                    className="flex-1 py-2 rounded-lg border border-border text-xs font-semibold text-muted hover:text-text-primary transition-colors">
                    Cancel
                  </button>
                  <button onClick={createAndChoose} disabled={createBusy}
                    className="flex-1 py-2 rounded-lg bg-accent text-bg text-xs font-bold hover:bg-accent/90 disabled:opacity-60 transition-colors">
                    {createBusy ? 'Creating…' : 'Create & Choose'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
