'use client'

import { useRef, useState } from 'react'
import type { TrackedJob } from '@/lib/studio/useJobTracker'

function WatermarkIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
function AIIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.344.344a.75.75 0 01-.53.22H9.75a.75.75 0 01-.53-.22l-.344-.344z" />
    </svg>
  )
}

const JOB_LABEL: Record<TrackedJob['jobType'], string> = {
  WATERMARK: 'Watermarking',
  INDEX_FACES: 'AI Sorting',
}

function statusLine(job: TrackedJob): string {
  switch (job.status) {
    case 'PENDING':     return 'Starting…'
    case 'PROCESSING':  return `${job.processed} of ${job.total} photos`
    case 'READY':       return 'Done'
    case 'CANCELLED':   return 'Cancelled'
    case 'FAILED':      return job.errorMessage || 'Something went wrong'
  }
}

// Rendered once from dashboard/layout.tsx (not per-EventSection) so it's
// visible regardless of which page/tab is currently focused, and there's
// exactly one instance — never duplicated. Multiple simultaneous jobs stack
// as rows in one panel, the same familiar shape as a browser/Drive-style
// upload tray.
//
// Defaults to bottom-6 right-6, but the header bar is a drag handle — the
// admin can park it anywhere on screen (e.g. out of the way of the grid's
// own bottom-right zoom control) via the same mouse+touch drag pattern
// already used for the zoom bar's slider in dashboard/layout.tsx. Position
// is in-memory only (resets to the default corner on a full page reload),
// which is fine for what is meant to be a transient, temporary repositioning.
export default function BulkJobProgressToast({
  jobs, onCancel, onDismiss,
}: {
  jobs: TrackedJob[]
  onCancel: (job: TrackedJob) => void
  onDismiss: (jobId: string) => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const startDrag = (e: React.MouseEvent | React.TouchEvent) => {
    const rect = panelRef.current?.getBoundingClientRect()
    if (!rect) return
    const getPoint = (ev: MouseEvent | TouchEvent) => 'touches' in ev ? ev.touches[0] : ev
    const start = getPoint(e.nativeEvent)
    const offsetX = start.clientX - rect.left
    const offsetY = start.clientY - rect.top

    const clamp = (clientX: number, clientY: number) => ({
      left: Math.min(Math.max(0, clientX - offsetX), window.innerWidth - rect.width),
      top: Math.min(Math.max(0, clientY - offsetY), window.innerHeight - rect.height),
    })

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const p = getPoint(ev)
      setPos(clamp(p.clientX, p.clientY))
      ev.preventDefault()
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove as EventListener)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove as EventListener)
      window.removeEventListener('touchend', onUp)
    }
    window.addEventListener('mousemove', onMove as EventListener)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove as EventListener, { passive: false })
    window.addEventListener('touchend', onUp)
    e.preventDefault()
  }

  if (jobs.length === 0) return null

  return (
    <div
      ref={panelRef}
      style={pos ? { top: pos.top, left: pos.left, right: 'auto', bottom: 'auto', transform: 'none' } : undefined}
      className={`fixed z-40 w-80 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden ${pos ? '' : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'}`}
    >
      <div
        onMouseDown={startDrag}
        onTouchStart={startDrag}
        title="Drag to move"
        className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-border/20 cursor-grab active:cursor-grabbing select-none"
      >
        <svg className="w-3 h-3 text-muted flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" />
          <circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" />
          <circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" />
        </svg>
        <span className="text-[10px] font-bold text-muted uppercase tracking-wide">Background Jobs</span>
      </div>
      <div className="divide-y divide-border">
        {jobs.map(job => {
          const active = job.status === 'PENDING' || job.status === 'PROCESSING'
          const pct = job.total > 0 ? Math.min(100, Math.round((job.processed / job.total) * 100)) : 0
          const barColor = job.status === 'FAILED' ? 'bg-danger' : job.status === 'CANCELLED' ? 'bg-muted' : 'bg-accent'
          return (
            <div key={job.jobId} className="px-4 py-3">
              <div className="flex items-start gap-2.5">
                <span className={`flex-shrink-0 mt-0.5 ${active ? 'text-accent' : job.status === 'FAILED' ? 'text-danger' : 'text-muted'}`}>
                  {job.jobType === 'WATERMARK' ? <WatermarkIcon /> : <AIIcon />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-text-primary truncate">{JOB_LABEL[job.jobType]}</p>
                    {active ? (
                      <button onClick={() => onCancel(job)} className="flex-shrink-0 text-[10px] font-semibold text-muted hover:text-danger transition-colors">
                        Cancel
                      </button>
                    ) : (
                      <button onClick={() => onDismiss(job.jobId)} className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded text-muted hover:text-text-primary hover:bg-border/60 transition-colors">
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-muted truncate mt-0.5">{job.label}</p>
                  <p className="text-[10px] text-muted mt-1">{statusLine(job)}</p>
                  <div className="h-1 rounded-full bg-border overflow-hidden mt-1.5">
                    <div className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                      style={{ width: `${job.status === 'READY' ? 100 : pct}%` }} />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
