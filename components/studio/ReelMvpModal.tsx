'use client'

import { useEffect, useRef, useState } from 'react'
import {
  computeReelCost, DEFAULT_AI_CLIP_DURATION_SEC,
  REEL_TEMPLATES, DEFAULT_REEL_TEMPLATE, type ReelTemplate,
  REEL_STYLES, REEL_STYLE_META, DEFAULT_REEL_STYLE,
} from '@/constants/videoProviders'
import type { ReelStyle } from '@/types/studio'

// "Fast minimal demo" scope (AI Reel Generator design doc, Phase 1) with a
// real premium-feeling flow layered on top per explicit request: template
// (Instagram/Shorts/Facebook) + style choice, animated generation screen,
// mobile-first full-screen / tablet+desktop centered-card responsive split.
// Still a single self-contained modal rather than the design doc's full
// AIReelButton/ReelPhotoSelector/ReelGenerationScreen/ReelPreview split —
// that's a later refactor once this UX is validated, not a correctness gap.

type Stage = 'template' | 'style' | 'confirm' | 'generating' | 'completed' | 'failed'
const GENERATING_MESSAGES = ['Selecting your best moments…', 'Bringing your story to life…', 'Adding cinematic touches…', 'Almost there…']

function aspectClass(ratio: string) {
  if (ratio === '4:5') return 'aspect-[4/5]'
  if (ratio === '16:9') return 'aspect-[16/9]'
  return 'aspect-[9/16]'
}

function styleGradient(style: ReelStyle) {
  const [a, b, c] = REEL_STYLE_META[style].colors
  return `linear-gradient(135deg, ${a}, ${b} 55%, ${c})`
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

function TemplateCard({ template, selected, onClick }: { template: ReelTemplate; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all duration-200 active:scale-95 hover:-translate-y-0.5
        ${selected ? 'border-accent bg-accent/10 shadow-lg shadow-accent/20' : 'border-border hover:border-accent/40'}`}
    >
      <div className={`${aspectClass(template.aspectRatio)} w-10 rounded-md bg-gradient-to-br from-border to-border/40 border border-border flex items-center justify-center text-base`}>
        {template.icon}
      </div>
      <span className="text-[11px] font-bold text-text-primary text-center leading-tight">{template.label}</span>
    </button>
  )
}

// Gamified "trading card" treatment — idle float, holographic shimmer
// sweep, pulsing glow + pop-in checkmark on select, energy-level pips.
// Colors are applied via inline style (real CSS), never Tailwind gradient
// classes — see constants/videoProviders.ts#REEL_STYLE_META's comment for
// why that distinction matters (a real light-mode invisibility bug).
function StyleCard({ style, selected, onClick, reducedMotion }: { style: ReelStyle; selected: boolean; onClick: () => void; reducedMotion: boolean }) {
  const meta = REEL_STYLE_META[style]
  return (
    <button
      onClick={onClick}
      style={{ background: styleGradient(style) }}
      className={`relative overflow-hidden rounded-2xl h-28 text-left p-3 flex flex-col justify-end
        transition-transform duration-200 active:scale-95 hover:-translate-y-1 hover:scale-[1.02]
        ${!reducedMotion ? 'animate-reel-float' : ''}
        ${selected ? 'animate-reel-glow scale-[1.03]' : 'shadow-lg shadow-black/20'}`}
    >
      <span className="absolute -right-3 -top-3 text-6xl opacity-20 rotate-12 select-none">{meta.icon}</span>

      {!reducedMotion && (
        <span className="absolute inset-0 overflow-hidden pointer-events-none">
          <span className="absolute left-0 top-0 w-1/3 h-[250%] bg-white/25 blur-md animate-reel-shimmer" />
        </span>
      )}

      <span className="relative flex items-center gap-1 text-sm font-extrabold text-white drop-shadow-md">
        <span>{meta.icon}</span>{meta.label}
      </span>
      <span className="relative text-[10px] text-white/85 leading-tight">{meta.description}</span>
      <span className="relative flex gap-0.5 mt-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className={`w-3.5 h-1 rounded-full ${i < meta.energy ? 'bg-white/90' : 'bg-white/25'}`} />
        ))}
      </span>

      {selected && (
        <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-lg animate-reel-pop-in">
          <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </span>
      )}
    </button>
  )
}

export default function ReelMvpModal({
  token, projectId, photoIds, onClose,
}: {
  token: string
  projectId: string
  photoIds: string[]
  onClose: () => void
}) {
  const [stage, setStage] = useState<Stage>('template')
  const [templateId, setTemplateId] = useState(DEFAULT_REEL_TEMPLATE)
  const [style, setStyle] = useState<ReelStyle>(DEFAULT_REEL_STYLE)
  const [error, setError] = useState<string | null>(null)
  const [reelId, setReelId] = useState<string | null>(null)
  const [creditsCharged, setCreditsCharged] = useState<number | null>(null)
  const [outputUrl, setOutputUrl] = useState<string | null>(null)
  const [msgIdx, setMsgIdx] = useState(0)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reducedMotion = useReducedMotion()

  const template = REEL_TEMPLATES.find((t) => t.id === templateId) ?? REEL_TEMPLATES[0]
  const { creditsRequired } = computeReelCost(photoIds.length, DEFAULT_AI_CLIP_DURATION_SEC)

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current) }, [])

  useEffect(() => {
    if (stage !== 'generating' || reducedMotion) return
    const id = setInterval(() => setMsgIdx((i) => (i + 1) % GENERATING_MESSAGES.length), 4000)
    return () => clearInterval(id)
  }, [stage, reducedMotion])

  const poll = (id: string) => {
    pollRef.current = setTimeout(async () => {
      const res = await fetch(`/studio/api/client/gallery/${token}/events/${projectId}/reels/${id}/status`).then((r) => r.json()).catch(() => null)
      if (!res?.success) { poll(id); return }
      if (res.data.status === 'completed') {
        setOutputUrl(res.data.outputUrl)
        setStage('completed')
      } else if (res.data.status === 'failed') {
        setError(res.data.errorMessage ?? 'Something went wrong generating your reel.')
        setStage('failed')
      } else {
        poll(id)
      }
    }, 3000)
  }

  const handleGenerate = async () => {
    setStage('generating')
    setError(null)
    const res = await fetch(`/studio/api/client/gallery/${token}/events/${projectId}/reels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoIds, templateId, style }),
    }).then((r) => r.json()).catch(() => null)

    if (!res?.success) {
      setError(res?.message ?? 'Could not start your reel. Please try again.')
      setStage('failed')
      return
    }
    setReelId(res.data.reelId)
    setCreditsCharged(res.data.creditsCharged)
    poll(res.data.reelId)
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-end sm:items-center justify-center" onClick={stage === 'generating' ? undefined : onClose}>
      <div
        className="bg-card border-t sm:border border-border rounded-t-3xl sm:rounded-3xl p-6 w-full sm:max-w-md max-h-[92vh] sm:max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {stage === 'template' && (
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <div className="text-3xl">✨</div>
              <h2 className="text-lg font-bold text-text-primary">Where's this reel going?</h2>
              <p className="text-xs text-muted">{photoIds.length} photos selected</p>
            </div>
            <div className="flex gap-2.5">
              {REEL_TEMPLATES.map((t) => (
                <TemplateCard key={t.id} template={t} selected={templateId === t.id} onClick={() => setTemplateId(t.id)} />
              ))}
            </div>
            <button onClick={() => setStage('style')} className="w-full bg-accent text-bg text-sm font-bold py-3 rounded-xl hover:bg-accent/90 active:scale-[0.98] transition-all">
              Next →
            </button>
          </div>
        )}

        {stage === 'style' && (
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <h2 className="text-lg font-bold text-text-primary">Pick a mood</h2>
              <p className="text-xs text-muted">You can always create another with a different style</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {REEL_STYLES.map((s) => (
                <StyleCard key={s} style={s} selected={style === s} onClick={() => setStyle(s)} reducedMotion={reducedMotion} />
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStage('template')} className="flex-1 border border-border text-text-primary text-sm font-semibold py-3 rounded-xl hover:bg-border transition-colors">Back</button>
              <button onClick={() => setStage('confirm')} className="flex-1 bg-accent text-bg text-sm font-bold py-3 rounded-xl hover:bg-accent/90 active:scale-[0.98] transition-all">Next →</button>
            </div>
          </div>
        )}

        {stage === 'confirm' && (
          <div className="space-y-5">
            <div className="text-center space-y-2">
              <div className="text-4xl">🎬</div>
              <h2 className="text-lg font-bold text-text-primary">Ready to create your reel</h2>
            </div>
            <div className="bg-bg border border-border rounded-2xl px-4 py-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted">Photos</span><span className="font-semibold text-text-primary">{photoIds.length}</span></div>
              <div className="flex justify-between"><span className="text-muted">Format</span><span className="font-semibold text-text-primary">{template.icon} {template.label}</span></div>
              <div className="flex justify-between"><span className="text-muted">Style</span><span className="font-semibold text-text-primary">{REEL_STYLE_META[style].icon} {REEL_STYLE_META[style].label}</span></div>
              <div className="flex justify-between border-t border-border pt-2"><span className="text-muted">Cost</span><span className="font-bold text-accent">{creditsRequired} credits</span></div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStage('style')} className="flex-1 border border-border text-text-primary text-sm font-semibold py-3 rounded-xl hover:bg-border transition-colors">Back</button>
              <button onClick={handleGenerate} className="flex-1 bg-accent text-bg text-sm font-bold py-3 rounded-xl hover:bg-accent/90 active:scale-[0.98] transition-all">✨ Generate</button>
            </div>
          </div>
        )}

        {stage === 'generating' && (
          <div className="text-center space-y-5 py-6">
            <div className="relative w-20 h-20 mx-auto">
              <div
                className={`absolute inset-0 rounded-full ${reducedMotion ? '' : 'animate-spin'}`}
                style={{ background: styleGradient(style), animationDuration: '2.5s' }}
              />
              <div className="absolute inset-1.5 rounded-full bg-card flex items-center justify-center text-2xl">{REEL_STYLE_META[style].icon}</div>
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary transition-opacity duration-500">{reducedMotion ? 'Creating your reel…' : GENERATING_MESSAGES[msgIdx]}</h2>
              <p className="text-xs text-muted mt-1.5">This can take a few minutes. Feel free to keep browsing — it'll be ready when you come back.</p>
              {creditsCharged !== null && <p className="text-[11px] text-muted mt-2">{creditsCharged} credits used</p>}
            </div>
          </div>
        )}

        {stage === 'completed' && outputUrl && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-text-primary text-center">Your reel is ready! 🎉</h2>
            <div className={`${aspectClass(template.aspectRatio)} max-h-[55vh] mx-auto rounded-2xl overflow-hidden bg-black`}>
              <video src={outputUrl} controls autoPlay className="w-full h-full object-contain" />
            </div>
            <div className="flex gap-3">
              <a href={outputUrl} download className="flex-1 border border-border text-text-primary text-sm font-semibold py-3 rounded-xl hover:bg-border transition-colors text-center">Download</a>
              <button onClick={onClose} className="flex-1 bg-accent text-bg text-sm font-bold py-3 rounded-xl hover:bg-accent/90 transition-colors">Done</button>
            </div>
          </div>
        )}

        {stage === 'failed' && (
          <div className="text-center space-y-4">
            <div className="text-4xl">😕</div>
            <div>
              <h2 className="text-base font-bold text-text-primary">Couldn't create your reel</h2>
              <p className="text-xs text-muted mt-1">{error}</p>
              {reelId && <p className="text-[10px] text-muted mt-2">Any credits used have been refunded if generation failed to start.</p>}
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 border border-border text-text-primary text-sm font-semibold py-3 rounded-xl hover:bg-border transition-colors">Close</button>
              <button onClick={() => setStage('confirm')} className="flex-1 bg-accent text-bg text-sm font-bold py-3 rounded-xl hover:bg-accent/90 transition-colors">Try Again</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
