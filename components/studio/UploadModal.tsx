'use client'

import { useEffect, useRef, useState } from 'react'
import type { StudioProject } from '@/types/studio'
import AddEventModal from '@/app/studio/(studio-admin)/dashboard/AddEventModal'

interface Props {
  currentProject: StudioProject
  onClose: () => void
  // Enqueues files against a specific project and starts uploading —
  // EventSection's own (project-parameterized) handleFiles.
  onFilesChosen: (files: FileList, targetProjectId: string) => void
}

type MediaType = 'photo' | 'video'

// Chooser-only popup — resolves "which event + which files", hands off to
// the existing upload/progress system, then closes itself. Doesn't
// duplicate any progress UI (that already lives below the toolbar).
export default function UploadModal({ currentProject, onClose, onFilesChosen }: Props) {
  const [events, setEvents] = useState<StudioProject[]>([currentProject])
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [targetProjectId, setTargetProjectId] = useState(currentProject.projectId)
  const [mediaType, setMediaType] = useState<MediaType>('photo')
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [skippedWarning, setSkippedWarning] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadEvents = () => {
    setLoadingEvents(true)
    fetch('/studio/api/admin/projects').then(r => r.json()).then(d => {
      if (!d.success) { setLoadingEvents(false); return }
      const clientEvents = (d.data as StudioProject[]).filter(p =>
        p.clientName === currentProject.clientName && !p.isPlaceholder
      )
      setEvents(clientEvents.length > 0 ? clientEvents : [currentProject])
      setLoadingEvents(false)
    }).catch(() => setLoadingEvents(false))
  }

  useEffect(() => {
    loadEvents()
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Video isn't supported yet — any non-image file is quietly filtered out
  // with a friendly heads-up, rather than failing the whole batch or
  // silently vanishing.
  const acceptFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return
    const files = Array.from(list)
    const images = files.filter(f => f.type.startsWith('image/'))
    const skipped = files.filter(f => !f.type.startsWith('image/'))
    if (skipped.length > 0) {
      setSkippedWarning(`Video uploads aren't supported yet — skipped: ${skipped.map(f => f.name).join(', ')}`)
    }
    if (images.length === 0) return
    const dt = new DataTransfer()
    images.forEach(f => dt.items.add(f))
    onFilesChosen(dt.files, targetProjectId)
    onClose()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragActive(false)
    acceptFiles(e.dataTransfer.files)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="text-sm font-bold text-text-primary">Upload Media</h2>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-lg text-muted hover:text-text-primary hover:bg-border/60 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Upload to */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-muted uppercase tracking-wider">Upload to</label>
            {loadingEvents ? (
              <div className="flex items-center justify-center py-6">
                <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {events.map(p => (
                  <button key={p.projectId} type="button" onClick={() => setTargetProjectId(p.projectId)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left transition-colors ${
                      targetProjectId === p.projectId ? 'bg-accent/10 border border-accent/40' : 'border border-transparent hover:bg-border/40'
                    }`}>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-text-primary truncate">{(p.eventType ?? '').replace(/_/g, ' ')}</div>
                      <div className="text-[10px] text-muted">
                        {new Date(p.eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    {targetProjectId === p.projectId && (
                      <svg className="w-4 h-4 text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </button>
                ))}
                <button type="button" onClick={() => setShowAddEvent(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left text-accent hover:bg-accent/10 transition-colors">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  <span className="text-xs font-semibold">Create New Event</span>
                </button>
              </div>
            )}
          </div>

          {/* Media type */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-muted uppercase tracking-wider">Media type</label>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setMediaType('photo')}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  mediaType === 'photo' ? 'bg-accent text-bg border-accent' : 'border-border text-muted hover:text-text-primary'
                }`}>
                Photos
              </button>
              <button type="button" disabled title="Video uploads are coming soon"
                className="flex-1 py-2 rounded-xl text-xs font-semibold border border-border text-muted/50 cursor-not-allowed flex items-center justify-center gap-1.5">
                Video
                <span className="text-[9px] font-bold uppercase tracking-wide bg-border/60 text-muted px-1.5 py-0.5 rounded-full">Soon</span>
              </button>
            </div>
          </div>

          {skippedWarning && (
            <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-lg px-3 py-2 text-[11px] text-yellow-500 flex items-start gap-2">
              <span className="flex-1">{skippedWarning}</span>
              <button onClick={() => setSkippedWarning(null)} className="opacity-70 hover:opacity-100 flex-shrink-0">×</button>
            </div>
          )}

          {/* Source */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-muted uppercase tracking-wider">Source</label>
            <div
              onDragOver={e => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
                dragActive ? 'border-accent bg-accent/10' : 'border-border'
              }`}
            >
              <p className="text-[11px] text-muted mb-3">Drag photos here, or</p>
              <div className="flex items-center justify-center gap-2">
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 bg-accent text-bg text-xs font-bold px-4 py-2 rounded-xl hover:bg-accent/90 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  Choose from Computer
                </button>
                <button type="button" disabled title="Google Drive upload is coming soon"
                  className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl border border-border text-muted/40 cursor-not-allowed">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <path d="M8.5 3h7l6.5 11.3-3.5 6.1h-13L2 14.3 8.5 3z" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
                    <path d="M8.5 3l6.5 11.3M15 14.3H2m13 0l3.5 6.1" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden"
                onChange={e => acceptFiles(e.target.files)} />
            </div>
          </div>
        </div>
      </div>

      {showAddEvent && (
        <AddEventModal
          clientName={currentProject.clientName}
          existingProjects={events}
          onClose={() => setShowAddEvent(false)}
          onCreated={(newProjectId) => {
            setShowAddEvent(false)
            setTargetProjectId(newProjectId)
            loadEvents()
          }}
        />
      )}
    </div>
  )
}
