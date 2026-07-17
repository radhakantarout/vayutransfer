'use client'

import { useEffect, useState } from 'react'
import type { StudioProject } from '@/types/studio'

interface Props {
  mode: 'copy' | 'move'
  clientName: string
  currentProjectId: string
  fileId: string
  onClose: () => void
  onDone: () => void
}

// Lets the admin copy or move one photo into another of the SAME client's
// events. Fetches the studio's full project list itself (like the sidebar
// does) rather than relying on whatever's currently open in the grid, since
// the target could be an event that isn't checked in the sidebar right now.
export default function MoveCopyPhotoModal({ mode, clientName, currentProjectId, fileId, onClose, onDone }: Props) {
  const [otherEvents, setOtherEvents] = useState<StudioProject[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    fetch('/studio/api/admin/projects').then(r => r.json()).then(d => {
      if (!d.success) { setLoading(false); return }
      const events = (d.data as StudioProject[]).filter(p =>
        p.clientName === clientName && p.projectId !== currentProjectId && !p.isPlaceholder
      )
      setOtherEvents(events)
      setLoading(false)
    }).catch(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const choose = async (targetProjectId: string) => {
    setBusyId(targetProjectId)
    setError('')
    try {
      const res = await fetch(`/studio/api/admin/projects/${currentProjectId}/files/${fileId}/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetProjectId }),
      })
      const data = await res.json()
      if (!data.success) { setError(data.message ?? `Failed to ${mode} photo.`); setBusyId(null); return }
      onDone()
    } catch {
      setError('Network error. Please try again.')
      setBusyId(null)
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
            <h2 className="text-base font-bold text-text-primary">{mode === 'copy' ? 'Copy to event' : 'Move to event'}</h2>
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
          ) : otherEvents.length === 0 ? (
            <p className="text-sm text-muted text-center py-10">This client has no other events yet.</p>
          ) : (
            <div className="space-y-1">
              {otherEvents.map(p => (
                <button
                  key={p.projectId}
                  onClick={() => choose(p.projectId)}
                  disabled={busyId !== null}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left hover:bg-border/50 transition-colors disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-text-primary truncate">{(p.eventType ?? '').replace(/_/g, ' ')}</div>
                    <div className="text-xs text-muted">
                      {new Date(p.eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  {busyId === p.projectId && (
                    <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
