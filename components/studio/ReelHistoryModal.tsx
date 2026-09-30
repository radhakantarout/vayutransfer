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
  // 'assembling' is a real, brief transient status reel-check sets right
  // before invoking the finalize Lambda (whether or not there's actually
  // anything to assemble — an Omni/text reel's single clip just gets
  // downloaded+uploaded, no real concat) — previously unmapped here, so it
  // fell through to showing the raw string "assembling" to the user.
  assembling: 'Finishing up…',
  completed: 'Ready',
  failed: 'Failed',
}
const STATUS_DOT: Record<string, string> = {
  generating: 'bg-yellow-400 animate-pulse',
  assembling: 'bg-yellow-400 animate-pulse',
  completed: 'bg-success',
  failed: 'bg-danger',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// "My Reels" — fast-minimal-demo version (matches ReelMvpModal's scope).
// Lists every reel ever generated for this event, newest first. Playing a
// reel just expands it inline rather than opening yet another modal layer.
// Shared by Client Gallery and VayuStudios Moments — `token` is omitted
// entirely for Moments (cookie-authenticated, no share-token concept).
type Props =
  | { source?: 'client'; token: string; projectId: string; onClose: () => void }
  | { source: 'moments'; projectId: string; onClose: () => void }

export default function ReelHistoryModal(props: Props) {
  const { projectId, onClose } = props
  const isMoments = props.source === 'moments'
  const listUrl = isMoments
    ? `/studio/api/moments/events/${projectId}/reels`
    : `/studio/api/client/gallery/${props.token}/events/${projectId}/reels`
  const [reels, setReels] = useState<ReelHistoryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetch(listUrl)
      .then((r) => r.json())
      .then((d) => { if (d.success) setReels(d.data); else setError('Could not load your reels.') })
      .catch(() => setError('Could not load your reels.'))
  }, [listUrl])

  // Manual "did Kling actually finish?" recovery for a reel stuck showing
  // generating/assembling — see check-now route's own header comment for
  // why this exists (production's periodic auto-check isn't reliably
  // wired up). Moments-only for now — Client Gallery has no equivalent
  // route yet.
  const handleCheckNow = async (reelId: string) => {
    if (checkingId) return
    setCheckingId(reelId)
    try {
      const res = await fetch(`/studio/api/moments/events/${projectId}/reels/${reelId}/check-now`, { method: 'POST' }).then((r) => r.json())
      if (res.success) {
        setReels((prev) => prev?.map((r) => r.reelId === reelId
          ? { ...r, status: res.data.status, outputUrl: res.data.outputUrl, errorMessage: res.data.errorMessage }
          : r) ?? null)
      }
    } catch (err) {
      console.error('[ReelHistoryModal check-now]', err)
    } finally {
      setCheckingId(null)
    }
  }

  const handleDelete = async (reelId: string) => {
    if (deletingId) return
    if (!window.confirm('Delete this reel permanently? This can\'t be undone.')) return
    setDeletingId(reelId)
    try {
      const res = await fetch(`/studio/api/moments/events/${projectId}/reels/${reelId}`, { method: 'DELETE' }).then((r) => r.json())
      if (res.success) {
        setReels((prev) => prev?.filter((r) => r.reelId !== reelId) ?? null)
        if (playingId === reelId) setPlayingId(null)
      } else if (res.error === 'STILL_GENERATING') {
        window.alert('This reel is still generating — wait for it to finish or fail before deleting it.')
      } else {
        window.alert('Could not delete this reel. Please try again.')
      }
    } catch (err) {
      console.error('[ReelHistoryModal delete]', err)
      window.alert('Could not delete this reel. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

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
              <div className="w-full flex items-center gap-2 px-3 py-2.5">
                <button
                  onClick={() => r.status === 'completed' && setPlayingId(playingId === r.reelId ? null : r.reelId)}
                  className="flex-1 min-w-0 flex items-center gap-3 text-left"
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

                <button
                  onClick={() => handleDelete(r.reelId)}
                  disabled={deletingId === r.reelId}
                  aria-label="Delete reel"
                  className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-danger/10 text-muted hover:text-danger disabled:opacity-50 transition-colors"
                >
                  {deletingId === r.reelId
                    ? <div className="w-3.5 h-3.5 border-2 border-danger border-t-transparent rounded-full animate-spin" />
                    : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9.5 7V5a1 1 0 011-1h3a1 1 0 011 1v2m2 0-.7 12.1a2 2 0 01-2 1.9H8.2a2 2 0 01-2-1.9L5.5 7h13z" />
                      </svg>
                    )}
                </button>
              </div>

              {isMoments && (r.status === 'generating' || r.status === 'assembling') && (
                <div className="px-3 pb-2.5 -mt-1">
                  <button
                    onClick={() => handleCheckNow(r.reelId)}
                    disabled={checkingId === r.reelId}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-accent hover:text-accent/80 disabled:opacity-50 transition-colors"
                  >
                    <svg className={`w-3 h-3 ${checkingId === r.reelId ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                    {checkingId === r.reelId ? 'Checking…' : 'Taking a while? Check now'}
                  </button>
                </div>
              )}

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
