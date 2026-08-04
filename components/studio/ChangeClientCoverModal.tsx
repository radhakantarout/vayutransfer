'use client'

import { useEffect, useState } from 'react'
import type { MediaFile, StudioProject } from '@/types/studio'

interface Props {
  clientName: string
  events: StudioProject[]        // real events only — where to pick a photo from
  anchorProjectId: string        // which row to PATCH the pointer onto
  onClose: () => void
  onSaved: () => void
}

// Lets the admin pick any photo across ALL of a client's events as the
// client-level cover shown on the My Projects card — independent of each
// event's own per-event coverPhotoFileId.
export default function ChangeClientCoverModal({ clientName, events, anchorProjectId, onClose, onSaved }: Props) {
  const [files, setFiles] = useState<(MediaFile & { r2PreviewUrl?: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    Promise.all(
      events.map(p =>
        fetch(`/studio/api/admin/projects/${p.projectId}/files`).then(r => r.json())
          .then(d => (d.success ? d.data : []) as (MediaFile & { r2PreviewUrl?: string })[])
      )
    ).then(results => {
      setFiles(results.flat().filter(f => f.processingStatus === 'READY'))
      setLoading(false)
    }).catch(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const choose = async (file: MediaFile) => {
    setSaving(file.fileId)
    setError('')
    try {
      const res = await fetch(`/studio/api/admin/projects/${anchorProjectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientCoverProjectId: file.projectId, clientCoverFileId: file.fileId }),
      })
      const data = await res.json()
      if (!data.success) { setError(data.message ?? 'Failed to set cover photo.'); setSaving(null); return }
      onSaved()
    } catch {
      setError('Network error. Please try again.')
      setSaving(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-text-primary">Change cover photo</h2>
            <p className="text-xs text-muted mt-0.5">{clientName}</p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-text-primary hover:bg-border/60 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 flex-1">
          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger mb-4">{error}</div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : files.length === 0 ? (
            <p className="text-sm text-muted text-center py-16">No photos uploaded yet — upload photos to an event first.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {files.map(f => (
                <button
                  key={f.fileId}
                  onClick={() => choose(f)}
                  disabled={saving !== null}
                  className="relative aspect-square rounded-lg overflow-hidden bg-border/40 hover:ring-2 hover:ring-accent transition-all disabled:opacity-50"
                >
                  {f.r2PreviewUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.r2PreviewUrl} alt={f.originalFilename} className="w-full h-full object-cover" />
                  )}
                  {saving === f.fileId && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
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
