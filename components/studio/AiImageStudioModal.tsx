'use client'

import { useEffect, useRef, useState } from 'react'
import { computeImageEditCost } from '@/constants/aiImageEditing'
import { aiSearchCreditPricePaise, toMomentsCredits } from '@/constants/studioPricing'
import { MAX_CUSTOM_PROMPT_LENGTH } from '@/constants/videoProviders'
import type { AiImageResolution, AiImageAspectRatio } from '@/types/studio'
import type { PricingConfig } from '@/types/pricingConfig'

// Phase 2 (text-to-image) + Phase 3 (reference-image editing/fusion) share
// this one modal — `sourceFiles` being non-empty is what puts it in 'edit'
// mode (Kling's `n` field lets one request generate a whole batch, so
// "batch count" here is a single generation request, not N separate ones).

type Stage = 'compose' | 'generating' | 'results' | 'failed'

const MIN_IMAGES = 1
const MAX_IMAGES = 9
// Mirrors MAX_SOURCE_IMAGES in the server route
// (app/studio/api/moments/events/[projectId]/ai-images/route.ts) — kept as
// a separate local constant since that route file is a server module and
// isn't meant to be imported client-side.
const MAX_SOURCE_IMAGES = 10
// Same "no 4K" constraint as the route/Lambda — see
// lambda/vayustudio-imagegen/providers/kling.js's header for why.
const RESOLUTIONS: AiImageResolution[] = ['1K', '2K']
const ASPECT_RATIOS: { value: AiImageAspectRatio; label: string; ratio: string | null }[] = [
  { value: 'auto', label: 'Auto', ratio: null },
  { value: '1:1', label: 'Square', ratio: '1/1' },
  { value: '16:9', label: 'Landscape', ratio: '16/9' },
  { value: '9:16', label: 'Portrait', ratio: '9/16' },
  { value: '4:3', label: 'Classic', ratio: '4/3' },
  { value: '3:4', label: 'Classic tall', ratio: '3/4' },
  { value: '3:2', label: 'Photo', ratio: '3/2' },
  { value: '2:3', label: 'Photo tall', ratio: '2/3' },
  { value: '21:9', label: 'Ultra-wide', ratio: '21/9' },
]
const PROMPT_IDEAS = [
  'A dreamy golden-hour portrait, soft bokeh background',
  'A vibrant confetti explosion frozen mid-air, studio lighting',
  'A cozy candlelit table setting, warm tones, shallow depth of field',
  'An abstract watercolor splash in sunset colors',
]
const GENERATING_MESSAGES = ['Mixing colors and light…', 'Sketching the composition…', 'Adding the finishing touches…', 'Almost ready…']

const GRADIENT = 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)'

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

interface Props {
  projectId: string
  onClose: () => void
  // Presence (non-empty) is what selects 'edit' mode — 1-10 gallery photos
  // the user already picked (bulk-select toolbar or PhotoLightbox's single-
  // photo shortcut), passed with their preview URLs so this modal can show
  // the @Image1/@Image2-labeled reference strip without looking anything up
  // itself.
  sourceFiles?: { fileId: string; previewUrl: string }[]
}

export default function AiImageStudioModal({ projectId, onClose, sourceFiles = [] }: Props) {
  const isEdit = sourceFiles.length > 0
  const [stage, setStage] = useState<Stage>('compose')
  const [prompt, setPrompt] = useState('')
  const [resolution, setResolution] = useState<AiImageResolution>('1K')
  const [aspectRatio, setAspectRatio] = useState<AiImageAspectRatio>('auto')
  const [numImages, setNumImages] = useState(1)
  const [pricing, setPricing] = useState<PricingConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [imageId, setImageId] = useState<string | null>(null)
  const [creditsCharged, setCreditsCharged] = useState<number | null>(null)
  const [progress, setProgress] = useState<{ percent: number } | null>(null)
  const [msgIdx, setMsgIdx] = useState(0)
  const [stagedUrls, setStagedUrls] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState<number | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reducedMotion = useReducedMotion()

  // Live, owner-editable rates — same fetch-once pattern as ReelMvpModal so
  // this quote stays in sync with the server's actual charge without a
  // redeploy, and never blocks the UI if the fetch is slow (computeImageEditCost
  // has its own sane hardcoded fallbacks).
  useEffect(() => {
    fetch('/studio/api/pricing-config').then((r) => r.json()).then((d) => { if (d.success) setPricing(d.data) }).catch(() => {})
  }, [])

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current) }, [])

  useEffect(() => {
    if (stage !== 'generating' || reducedMotion) return
    const id = setInterval(() => setMsgIdx((i) => (i + 1) % GENERATING_MESSAGES.length), 3500)
    return () => clearInterval(id)
  }, [stage, reducedMotion])

  const { sellPricePaise } = computeImageEditCost(numImages, resolution, pricing ?? undefined, sourceFiles.length)
  const creditsRequired = Math.max(1, Math.ceil(sellPricePaise / aiSearchCreditPricePaise(pricing?.aiExtraPaisePer1000)))
  const displayCreditsRequired = toMomentsCredits(creditsRequired, pricing?.momentsCreditDivisor)

  const poll = (id: string) => {
    pollRef.current = setTimeout(async () => {
      const res = await fetch(`/studio/api/moments/events/${projectId}/ai-images/${id}/status`).then((r) => r.json()).catch(() => null)
      if (!res?.success) { poll(id); return }
      if (res.data.status === 'completed') {
        setStagedUrls(res.data.stagedUrls)
        setSelected(new Set(res.data.stagedUrls.map((_: string, i: number) => i)))
        setStage('results')
      } else if (res.data.status === 'failed') {
        setError(res.data.errorMessage ?? 'Something went wrong generating your images.')
        setStage('failed')
      } else {
        if (res.data.progress) setProgress({ percent: res.data.progress.percent })
        poll(id)
      }
    }, 3000)
  }

  const handleGenerate = async () => {
    setStage('generating')
    setError(null)
    setProgress(null)
    const res = await fetch(`/studio/api/moments/events/${projectId}/ai-images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt, resolution, aspectRatio, numImages,
        sourceFileIds: isEdit ? sourceFiles.map((f) => f.fileId) : undefined,
      }),
    }).then((r) => r.json()).catch(() => null)

    if (!res?.success) {
      setError(res?.message ?? 'Could not start generation. Please try again.')
      setStage('failed')
      return
    }
    setImageId(res.data.imageId)
    setCreditsCharged(res.data.creditsCharged)
    poll(res.data.imageId)
  }

  const toggleSelected = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const handleSave = async () => {
    if (!imageId || selected.size === 0) return
    setSaving(true)
    const res = await fetch(`/studio/api/moments/events/${projectId}/ai-images/${imageId}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ indices: Array.from(selected) }),
    }).then((r) => r.json()).catch(() => null)
    setSaving(false)
    if (!res?.success) {
      setError(res?.message ?? 'Could not save your images. Please try again.')
      return
    }
    setSavedCount(res.data.fileIds.length)
  }

  const canGenerate = prompt.trim().length > 0

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/70 flex items-end sm:items-center justify-center"
      // No dismiss (backdrop or header button, see below) while generating —
      // unlike Reels, AI Images has no "check back later" history surface
      // yet (that's Phase 4), so closing mid-generation would strand the
      // user with no way to find the result once it's ready.
      onClick={stage === 'generating' ? undefined : onClose}
    >
      <div
        className="relative bg-card border-t sm:border border-border rounded-t-3xl sm:rounded-3xl p-6 w-full sm:max-w-lg max-h-[92vh] sm:max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {stage !== 'generating' && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-border/60 hover:bg-border flex items-center justify-center text-text-primary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {stage === 'compose' && (
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <div className="text-3xl">✨</div>
              <h2 className="text-lg font-bold text-text-primary">{isEdit ? 'Edit with AI' : 'AI Image Studio'}</h2>
              <p className="text-xs text-muted">
                {isEdit ? `Describe how to edit or combine ${sourceFiles.length === 1 ? 'this photo' : `these ${sourceFiles.length} photos`}` : 'Describe what you want to see'}
              </p>
            </div>

            {isEdit && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Reference photos</p>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                  {sourceFiles.map((f, i) => (
                    <div key={f.fileId} className="relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.previewUrl} alt={`Reference ${i + 1}`} className="w-full h-full object-cover" />
                      <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] font-bold text-center py-0.5">
                        @Image{i + 1}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted">
                  Reference them in your prompt by name, e.g. &quot;combine @Image1 and @Image2 into one scene&quot;.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value.slice(0, MAX_CUSTOM_PROMPT_LENGTH))}
                placeholder={isEdit
                  ? 'e.g. Turn @Image1 into a watercolor painting, keep the composition…'
                  : 'e.g. A dreamy golden-hour portrait with soft bokeh, cinematic lighting…'}
                rows={4}
                className="w-full bg-bg border border-border rounded-2xl px-3.5 py-3 text-sm text-text-primary placeholder:text-muted/50 focus:outline-none focus:border-accent/60 resize-y transition-colors"
                autoFocus
              />
              <p className="text-[10px] text-muted text-right">{prompt.length}/{MAX_CUSTOM_PROMPT_LENGTH}</p>
            </div>

            {!isEdit && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">💡 Need inspiration?</p>
                <div className="flex flex-wrap gap-1.5">
                  {PROMPT_IDEAS.map((idea) => (
                    <button
                      key={idea}
                      onClick={() => setPrompt(idea.slice(0, MAX_CUSTOM_PROMPT_LENGTH))}
                      className="text-[11px] font-medium text-accent bg-accent/10 border border-accent/20 rounded-full px-2.5 py-1 hover:bg-accent/20 transition-colors"
                    >
                      {idea.length > 38 ? idea.slice(0, 38) + '…' : idea}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Shape</p>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {ASPECT_RATIOS.map((ar) => (
                  <button
                    key={ar.value}
                    onClick={() => setAspectRatio(ar.value)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all active:scale-95 ${
                      aspectRatio === ar.value ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/40'
                    }`}
                  >
                    {ar.ratio ? (
                      <div
                        className={`w-6 rounded-sm border-2 ${aspectRatio === ar.value ? 'border-accent' : 'border-muted/50'}`}
                        style={{ aspectRatio: ar.ratio, maxHeight: 24 }}
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-sm border-2 border-dashed border-muted/50 flex items-center justify-center text-[9px] text-muted">?</div>
                    )}
                    <span className="text-[9px] font-semibold text-text-primary leading-tight text-center">{ar.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Quality</p>
                <div className="flex gap-1.5">
                  {RESOLUTIONS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setResolution(r)}
                      className={`flex-1 text-xs font-bold py-2 rounded-xl border-2 transition-all ${
                        resolution === r ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:border-accent/40'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">How many</p>
                <div className="flex items-center gap-2 bg-bg border border-border rounded-xl px-2 py-1.5">
                  <button
                    onClick={() => setNumImages((n) => Math.max(MIN_IMAGES, n - 1))}
                    disabled={numImages <= MIN_IMAGES}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-text-primary bg-card border border-border hover:bg-border/60 disabled:opacity-30 transition-colors"
                  >
                    −
                  </button>
                  <span className="flex-1 text-center text-sm font-bold text-text-primary">{numImages}</span>
                  <button
                    onClick={() => setNumImages((n) => Math.min(MAX_IMAGES, n + 1))}
                    disabled={numImages >= MAX_IMAGES}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-text-primary bg-card border border-border hover:bg-border/60 disabled:opacity-30 transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-bg border border-border rounded-2xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-muted">Cost</span>
              <span className="text-sm font-bold text-accent">{displayCreditsRequired} Moments Credits</span>
            </div>

            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="w-full text-sm font-bold py-3 rounded-xl text-white active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none hover:opacity-90"
              style={{ background: GRADIENT }}
            >
              ✨ Generate
            </button>
          </div>
        )}

        {stage === 'generating' && (
          <div className="text-center space-y-5 py-6">
            <div className="relative w-20 h-20 mx-auto">
              <div
                className={`absolute inset-0 rounded-full ${reducedMotion ? '' : 'animate-spin'}`}
                style={{ background: GRADIENT, animationDuration: '2.5s' }}
              />
              <div className="absolute inset-1.5 rounded-full bg-card flex items-center justify-center text-2xl">🎨</div>
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary transition-opacity duration-500">
                {progress ? `${GENERATING_MESSAGES[msgIdx]} ${progress.percent}%` : reducedMotion ? 'Creating your images…' : GENERATING_MESSAGES[msgIdx]}
              </h2>
              {progress && (
                <div className="h-1.5 w-40 mx-auto mt-3 rounded-full bg-border overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress.percent}%`, background: GRADIENT }} />
                </div>
              )}
              <p className="text-xs text-muted mt-2.5">This usually takes under a minute — feel free to keep browsing.</p>
              {creditsCharged !== null && (
                <p className="text-[11px] text-muted mt-2">{toMomentsCredits(creditsCharged, pricing?.momentsCreditDivisor)} Moments Credits used</p>
              )}
            </div>
          </div>
        )}

        {stage === 'results' && (
          <div className="space-y-4">
            {savedCount !== null ? (
              <div className="text-center space-y-3 py-4">
                <div className="text-4xl">🎉</div>
                <h2 className="text-base font-bold text-text-primary">
                  {savedCount} image{savedCount === 1 ? '' : 's'} saved to your gallery
                </h2>
                <button onClick={onClose} className="w-full text-sm font-bold py-3 rounded-xl text-white hover:opacity-90 active:scale-[0.98] transition-all" style={{ background: GRADIENT }}>
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="text-center space-y-1">
                  <h2 className="text-base font-bold text-text-primary">Your images are ready! ✨</h2>
                  <p className="text-xs text-muted">Pick the ones you want to keep — the rest are discarded</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {stagedUrls.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => toggleSelected(i)}
                      className={`relative rounded-2xl overflow-hidden border-2 transition-all aspect-square ${
                        selected.has(i) ? 'border-accent' : 'border-border opacity-50'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Generated ${i + 1}`} className="w-full h-full object-cover" />
                      <span
                        className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow ${
                          selected.has(i) ? 'text-white' : 'bg-white/80 text-transparent'
                        }`}
                        style={selected.has(i) ? { background: GRADIENT } : undefined}
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </span>
                    </button>
                  ))}
                </div>
                {error && <p className="text-xs text-danger text-center">{error}</p>}
                <div className="flex gap-3">
                  <button onClick={onClose} className="flex-1 border border-border text-text-primary text-sm font-semibold py-3 rounded-xl hover:bg-border transition-colors">
                    Discard all
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={selected.size === 0 || saving}
                    className="flex-1 text-sm font-bold py-3 rounded-xl text-white active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none hover:opacity-90"
                    style={{ background: GRADIENT }}
                  >
                    {saving ? 'Saving…' : `Save ${selected.size || ''}`}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {stage === 'failed' && (
          <div className="text-center space-y-4">
            <div className="text-4xl">😕</div>
            <div>
              <h2 className="text-base font-bold text-text-primary">Couldn't generate your images</h2>
              <p className="text-xs text-muted mt-1">{error}</p>
              {imageId && <p className="text-[10px] text-muted mt-2">Any credits used have been refunded if generation failed to start.</p>}
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 border border-border text-text-primary text-sm font-semibold py-3 rounded-xl hover:bg-border transition-colors">Close</button>
              <button onClick={() => setStage('compose')} className="flex-1 text-sm font-bold py-3 rounded-xl text-white hover:opacity-90 active:scale-[0.98] transition-all" style={{ background: GRADIENT }}>
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
