'use client'

import { useEffect, useState } from 'react'
import { REEL_TEMPLATES, REEL_STYLE_META } from '@/constants/videoProviders'
import type { ReelStyle } from '@/types/studio'

interface ReelHistoryItem {
  reelId: string
  status: string
  photoCount: number
  durationSec: number
  style: ReelStyle | null
  templateId: string | null
  creditsCharged: number
  createdAt: string
  completedAt: string | null
  errorMessage: string | null
  outputUrl: string | null
}

const STATUS_LABEL: Record<string, string> = {
  generating: 'Generating…',
  completed: 'Ready',
  failed: 'Failed',
}
const STATUS_DOT: Record<string, string> = {
  generating: 'bg-yellow-400 animate-pulse',
  completed: 'bg-success',
  failed: 'bg-danger',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// "My Reels" — fast-minimal-demo version (matches ReelMvpModal's scope).
// Lists every reel ever generated for this event, newest first. Playing a
// reel just expands it inline rather than opening yet another modal layer.
export default function ReelHistoryModal({
  token, projectId, onClose,
}: {
  token: string
  projectId: string
  onClose: () => void
}) {
  const [reels, setReels] = useState<ReelHistoryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/studio/api/client/gallery/${token}/events/${projectId}/reels`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setReels(d.data); else setError('Could not load your reels.') })
      .catch(() => setError('Could not load your reels.'))
  }, [token, projectId])

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center px-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-3xl p-6 w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 className="text-lg font-bold text-text-primary">✨ My Reels</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-border/60 text-muted hover:text-text-primary transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto space-y-2 -mx-1 px-1">
          {error && <p className="text-sm text-danger text-center py-8">{error}</p>}

          {!error && reels === null && (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!error && reels?.length === 0 && (
            <div className="text-center py-10 space-y-2">
              <div className="text-3xl">🎬</div>
              <p className="text-sm text-muted">No reels yet — love 5+ photos and hit ✨ Reel to create your first one.</p>
            </div>
          )}

          {reels?.map((r) => (
            <div key={r.reelId} className="border border-border rounded-2xl overflow-hidden">
              <button
                onClick={() => r.status === 'completed' && setPlayingId(playingId === r.reelId ? null : r.reelId)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-border/30 transition-colors"
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[r.status] ?? 'bg-muted'}`} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-text-primary truncate">
                    {r.templateId && <span>{REEL_TEMPLATES.find((t) => t.id === r.templateId)?.icon}</span>}
                    {r.photoCount} photos · {r.durationSec}s
                    {r.style && (
                      <span
                        className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded-full"
                        style={{ background: `linear-gradient(90deg, ${REEL_STYLE_META[r.style].colors[0]}, ${REEL_STYLE_META[r.style].colors[2]})` }}
                      >
                        {REEL_STYLE_META[r.style].icon} {REEL_STYLE_META[r.style].label}
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] text-muted">{fmtDate(r.createdAt)} · {r.creditsCharged} credits</span>
                </span>
                <span className="text-[11px] font-semibold text-muted flex-shrink-0">{STATUS_LABEL[r.status] ?? r.status}</span>
              </button>

              {r.status === 'failed' && r.errorMessage && (
                <p className="text-[11px] text-danger px-3 pb-2.5">{r.errorMessage}</p>
              )}

              {playingId === r.reelId && r.outputUrl && (
                <div className="p-2.5 pt-0 space-y-2">
                  <video src={r.outputUrl} controls autoPlay className="w-full rounded-xl bg-black" />
                  <a href={r.outputUrl} download className="block text-center text-xs font-semibold text-accent hover:underline py-1">Download</a>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
