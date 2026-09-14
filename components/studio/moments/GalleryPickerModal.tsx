'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const GRADIENT = 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)'

interface PickerEvent {
  projectId: string
  clientName: string
  coverPhotoUrl?: string | null
  isAdmin?: boolean
}

// Chat and People are both per-gallery concepts — from a top-level page
// (no specific gallery open) there's no single obvious target, so tapping
// either from the bottom bar opens this picker first. People mode only
// lists galleries the caller administers (matching who can actually manage
// people once inside one); Chat mode lists every gallery they can see.
export default function GalleryPickerModal({ mode, onClose }: { mode: 'chat' | 'people'; onClose: () => void }) {
  const router = useRouter()
  const [events, setEvents] = useState<PickerEvent[] | null>(null)

  useEffect(() => {
    fetch('/studio/api/moments/events')
      .then((r) => r.json())
      .then((res) => setEvents(res.success ? res.data : []))
      .catch(() => setEvents([]))
  }, [])

  const list = (events ?? []).filter((e) => mode === 'chat' || e.isAdmin)

  const pick = (projectId: string) => {
    router.push(`/studio/moments/${projectId}?open=${mode}`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-card border-t sm:border border-border rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm max-h-[75vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-sm font-bold text-text-primary">
            {mode === 'chat' ? 'Open which gallery’s chat?' : 'Manage people in which gallery?'}
          </h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-border/60 text-muted">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {events === null ? (
            <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
          ) : list.length === 0 ? (
            <p className="text-xs text-muted text-center py-10 px-4">
              {mode === 'people' ? "You don't manage any galleries yet." : "You don't have any galleries yet."}
            </p>
          ) : (
            list.map((e) => (
              <button
                key={e.projectId}
                onClick={() => pick(e.projectId)}
                className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl hover:bg-border/40 transition-colors text-left"
              >
                <div className="w-11 h-11 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center text-lg" style={!e.coverPhotoUrl ? { background: GRADIENT } : undefined}>
                  {e.coverPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.coverPhotoUrl} alt="" className="w-full h-full object-cover" />
                  ) : '🎉'}
                </div>
                <span className="text-sm font-semibold text-text-primary truncate">{e.clientName}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
