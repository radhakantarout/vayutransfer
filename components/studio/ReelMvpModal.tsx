'use client'

import { useEffect, useRef, useState } from 'react'
import {
  computeReelCost, DEFAULT_AI_CLIP_DURATION_SEC, REEL_CLIP_DURATION_OPTIONS, MAX_REEL_TOTAL_DURATION_SEC,
  REEL_TEMPLATES, DEFAULT_REEL_TEMPLATE, type ReelTemplate,
  REEL_STYLES, REEL_STYLE_META, DEFAULT_REEL_STYLE, MAX_CUSTOM_PROMPT_LENGTH, MOMENTS_COMPOSE_PROMPT_MAX,
  REEL_RESOLUTIONS, DEFAULT_REEL_RESOLUTION,
  DRONE_SHOT_STYLES, DRONE_SHOT_META, DEFAULT_DRONE_SHOT, type DroneShotStyle,
  MIN_REEL_PHOTOS, MAX_REEL_PHOTOS,
  computeTextToVideoCost, MOMENTS_TEXT_TO_VIDEO_PROMPT_MAX, MIN_TEXT_PROMPT_LENGTH,
  TEXT_TO_VIDEO_ASPECT_RATIOS, DEFAULT_TEXT_TO_VIDEO_ASPECT_RATIO,
  CFG_SCALE_PRESETS, DEFAULT_CFG_SCALE_PRESET, type CfgScalePreset, MAX_NEGATIVE_PROMPT_LENGTH,
} from '@/constants/videoProviders'
import { aiSearchCreditPricePaise, toMomentsCredits } from '@/constants/studioPricing'
import type { ReelStyle, ReelResolution } from '@/types/studio'
import type { PricingConfig } from '@/types/pricingConfig'
import AddReelPhotoSheet from '@/components/studio/moments/AddReelPhotoSheet'
import ReelGalleryPickerModal, { type ReelPickerPhoto } from '@/components/studio/moments/ReelGalleryPickerModal'

// "Fast minimal demo" scope (AI Reel Generator design doc, Phase 1) with a
// real premium-feeling flow layered on top per explicit request: template
// (Instagram/Shorts/Facebook) + style choice, animated generation screen,
// mobile-first full-screen / tablet+desktop centered-card responsive split.
// Still a single self-contained modal rather than the design doc's full
// AIReelButton/ReelPhotoSelector/ReelGenerationScreen/ReelPreview split —
// that's a later refactor once this UX is validated, not a correctness gap.

type Stage = 'compose' | 'template' | 'style' | 'prompt' | 'confirm' | 'generating' | 'completed' | 'failed'
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

function droneGradient(shot: DroneShotStyle) {
  const [a, b, c] = DRONE_SHOT_META[shot].colors
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

// Same premium "trading card" treatment as StyleCard — sky-toned gradients
// instead of mood colors, no energy pips (not a meaningful concept for a
// camera-motion choice).
function DroneCard({ shot, selected, onClick, reducedMotion }: { shot: DroneShotStyle; selected: boolean; onClick: () => void; reducedMotion: boolean }) {
  const meta = DRONE_SHOT_META[shot]
  return (
    <button
      onClick={onClick}
      style={{ background: droneGradient(shot) }}
      className={`relative overflow-hidden rounded-2xl h-24 text-left p-3 flex flex-col justify-end
        transition-transform duration-200 active:scale-95 hover:-translate-y-1 hover:scale-[1.02]
        ${!reducedMotion ? 'animate-reel-float' : ''}
        ${selected ? 'animate-reel-glow scale-[1.03]' : 'shadow-lg shadow-black/20'}`}
    >
      <span className="absolute -right-3 -top-3 text-5xl opacity-20 rotate-12 select-none">{meta.icon}</span>

      {!reducedMotion && (
        <span className="absolute inset-0 overflow-hidden pointer-events-none">
          <span className="absolute left-0 top-0 w-1/3 h-[250%] bg-white/25 blur-md animate-reel-shimmer" />
        </span>
      )}

      <span className="relative flex items-center gap-1 text-sm font-extrabold text-white drop-shadow-md">
        <span>{meta.icon}</span>{meta.label}
      </span>
      <span className="relative text-[10px] text-white/85 leading-tight">{meta.description}</span>

      {selected && (
        <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-lg animate-reel-pop-in">
          <svg className="w-3.5 h-3.5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </span>
      )}
    </button>
  )
}

// Shared by Client Gallery, Guest Selfie Search, and VayuStudios Moments —
// only the auth context and API paths differ (design doc: "components must
// work in both surfaces, only authorization/data source should differ").
// Guest mode requires searchSessionId, the trust-boundary token proving
// these photoIds actually came from THIS guest's own selfie search (see
// app/studio/api/guest/[token]/search/route.ts's session-persistence fix).
// Moments has no share-token at all — the caller is already authenticated
// via the studio_token cookie (role CLIENT, owner of their own personal
// Studio), same as every other /studio/api/moments/* route.
//
// `initial`, when present, is a "Regenerate" request from My Reels history
// (a completed reel the user wants a fresh take on, or a failed one) — the
// same photos and settings that reel was created with, pre-filled here so
// the modal opens straight on the confirm screen ready to tap Generate, or
// the user can tap Back through any earlier step to change something first
// before regenerating. Omitted entirely for a brand-new reel (the normal
// "Reel it" flow), which still starts from the template-picker.
export interface ReelRegeneratePrefill {
  templateId?: string
  style?: ReelStyle
  resolution?: ReelResolution
  clipDurationSec?: number
  customPrompt?: string
  droneShot?: string
  // Only meaningful for a mode: 'text' reel's own aspect-ratio choice
  // ('9:16'/'16:9'/'1:1', see TEXT_TO_VIDEO_ASPECT_RATIOS) — loosely typed
  // as `string` here rather than either mode's own narrower union since
  // this single field is shared across both, validated at the point of use.
  aspectRatio?: string
}

type ReelMvpModalProps =
  | { source: 'client'; token: string; projectId: string; photoIds: string[]; onClose: () => void; initial?: ReelRegeneratePrefill }
  | { source: 'guest'; token: string; searchSessionId: string; photoIds: string[]; onClose: () => void; initial?: ReelRegeneratePrefill }
  | {
      source: 'moments'; projectId: string; photoIds: string[]; onClose: () => void; initial?: ReelRegeneratePrefill
      // Only ever populated by the Moments caller — used exclusively by the
      // new 'compose' stage's own photo picker below. client/guest never
      // pass these and never reach a code path that reads them.
      onUploadPhotoForReel?: (file: File) => Promise<string | null>
      momentsPhotos?: ReelPickerPhoto[]
    }

// VayuStudios Moments-only accent — the same brand gradient used everywhere
// else in that surface (bottom nav, hero cards, upload CTA). Client Gallery
// and Guest keep their existing plain `bg-accent` primary buttons untouched.
const MOMENTS_GRADIENT = 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)'

export default function ReelMvpModal(props: ReelMvpModalProps) {
  const { photoIds, onClose } = props
  const isMoments = props.source === 'moments'
  // Mutable, internal selection — `photoIds` itself stays whatever the
  // caller passed in (client/guest always pass a real pre-selected list;
  // Moments' "Regenerate" path passes the prior reel's photos; a fresh
  // Moments "Reel it" open passes []). Only the new Moments compose stage's
  // add/remove-photo actions ever call the setter below — every other path
  // through this component never touches it, so composePhotoIds stays
  // permanently equal to whatever it was seeded with, identical to today's
  // behavior for client/guest and for Regenerate.
  const [composePhotoIds, setComposePhotoIds] = useState<string[]>(photoIds)
  const primaryBtnClass = `flex-1 text-sm font-bold py-3 rounded-xl active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none ${
    isMoments ? 'text-white hover:opacity-90' : 'bg-accent text-bg hover:bg-accent/90'
  }`
  const primaryBtnStyle = isMoments ? { background: MOMENTS_GRADIENT } : undefined
  const createUrl = props.source === 'client'
    ? `/studio/api/client/gallery/${props.token}/events/${props.projectId}/reels`
    : props.source === 'moments'
      ? `/studio/api/moments/events/${props.projectId}/reels`
      : `/studio/api/guest/${props.token}/reels`
  const statusUrl = (reelId: string) => props.source === 'client'
    ? `/studio/api/client/gallery/${props.token}/events/${props.projectId}/reels/${reelId}/status`
    : props.source === 'moments'
      ? `/studio/api/moments/events/${props.projectId}/reels/${reelId}/status`
      : `/studio/api/guest/${props.token}/reels/${reelId}/status`
  const { initial } = props
  // Fresh Moments opens (no Regenerate `initial`) land on the new prompt-
  // first 'compose' screen instead of the old template-first wizard's first
  // step — client/guest are completely unaffected (still always 'template'
  // when there's no `initial`). Regenerate normally lands on 'confirm'
  // unchanged, EXCEPT a Moments Regenerate of a text-to-video reel (mode:
  // 'text' reels are stored with photoIds: []) — 'confirm' assumes a
  // photo-based reel throughout (photo count, resolution/clip-length,
  // per-photo consent copy), so that case instead lands back on 'compose',
  // which already auto-detects text mode from an empty photo list and
  // pre-fills the prompt via `customPrompt` below. client/guest never reach
  // this branch (text mode is Moments-only; their reels always have >=1
  // photo), so their Regenerate path is provably unchanged.
  const [stage, setStage] = useState<Stage>(
    initial ? (isMoments && photoIds.length === 0 ? 'compose' : 'confirm') : isMoments ? 'compose' : 'template'
  )
  const [templateId, setTemplateId] = useState(initial?.templateId ?? DEFAULT_REEL_TEMPLATE)
  const [style, setStyle] = useState<ReelStyle>(initial?.style ?? DEFAULT_REEL_STYLE)
  const [resolution, setResolution] = useState<ReelResolution>((initial?.resolution ?? DEFAULT_REEL_RESOLUTION) as ReelResolution)
  const [durationSec, setDurationSec] = useState<number>(initial?.clipDurationSec ?? DEFAULT_AI_CLIP_DURATION_SEC)
  // Drone Mode — off by default (opt-in, recommended for outdoor photos),
  // unless regenerating a reel that had it on.
  const [droneMode, setDroneMode] = useState(!!initial?.droneShot)
  const [droneShot, setDroneShot] = useState<DroneShotStyle>((initial?.droneShot as DroneShotStyle) ?? DEFAULT_DRONE_SHOT)
  const [customPrompt, setCustomPrompt] = useState(initial?.customPrompt ?? '')
  const [consentChecked, setConsentChecked] = useState(false)
  // 'compose'-stage-only state (Moments fresh-open path).
  const [showAddPhotoSheet, setShowAddPhotoSheet] = useState(false)
  const [showGalleryPicker, setShowGalleryPicker] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  // Text-mode-only Advanced fields (Phase 4) — inert/unused whenever
  // isComposeTextMode is false, never read by handleGenerate's photo-mode
  // body branch.
  const [textAspectRatio, setTextAspectRatio] = useState<(typeof TEXT_TO_VIDEO_ASPECT_RATIOS)[number]>(
    (initial?.aspectRatio && (TEXT_TO_VIDEO_ASPECT_RATIOS as readonly string[]).includes(initial.aspectRatio))
      ? (initial.aspectRatio as (typeof TEXT_TO_VIDEO_ASPECT_RATIOS)[number])
      : DEFAULT_TEXT_TO_VIDEO_ASPECT_RATIO
  )
  const [cfgScalePreset, setCfgScalePreset] = useState<CfgScalePreset>(DEFAULT_CFG_SCALE_PRESET)
  const [negativePrompt, setNegativePrompt] = useState('')
  const composeFileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [reelId, setReelId] = useState<string | null>(null)
  const [creditsCharged, setCreditsCharged] = useState<number | null>(null)
  const [outputUrl, setOutputUrl] = useState<string | null>(null)
  const [msgIdx, setMsgIdx] = useState(0)
  const [progress, setProgress] = useState<{ stage: string; percent: number } | null>(null)
  const [pricing, setPricing] = useState<PricingConfig | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reducedMotion = useReducedMotion()

  // Live, owner-editable rates (lib/pricingConfig.ts) — falls back to
  // whatever computeReelCost's own hardcoded defaults are if this hasn't
  // loaded yet, so the quote never blocks on the fetch. Fetching here
  // (rather than trusting a build-time constant) is what keeps this preview
  // in sync with the server's actual charge the moment an admin changes a
  // price, with zero redeploy.
  useEffect(() => {
    fetch('/studio/api/pricing-config').then((r) => r.json()).then((d) => { if (d.success) setPricing(d.data) }).catch(() => {})
  }, [])

  const template = REEL_TEMPLATES.find((t) => t.id === templateId) ?? REEL_TEMPLATES[0]
  // Auto-detected, not an explicit toggle: zero photos on the compose screen
  // means text-to-video, one or more means image-to-video — matches how
  // every other "generate from a prompt, optionally attach a reference"
  // tool works, and one fewer decision for the user to make up front. Only
  // ever true for Moments (the only source with a 'compose' stage/text-mode
  // route at all) — client/guest always keep composePhotoIds >= 1.
  const isComposeTextMode = isMoments && composePhotoIds.length === 0
  const { sellPricePaise, creditsRequired: reelPoolCreditsRequired } = isComposeTextMode
    ? computeTextToVideoCost(pricing ?? undefined)
    : computeReelCost(composePhotoIds.length, durationSec, resolution, pricing ?? undefined)
  // Moments spends from the shared AI-search-credit pool (₹0.30/credit),
  // NOT the Client Gallery/Guest reel-credit pool (₹80/credit) this
  // component was originally built for — same real ₹ cost, wildly
  // different credit COUNT. Showing the wrong pool's number here used to
  // quote a small figure that had nothing to do with what the server
  // actually charged/rejected against.
  const creditsRequired = isMoments
    ? Math.max(1, Math.ceil(sellPricePaise / aiSearchCreditPricePaise(pricing?.aiExtraPaisePer1000)))
    : reelPoolCreditsRequired
  // Moments' Profile/UsageBillingPanel show this same underlying pool in the
  // friendly "Moments Credits" unit (raw ÷ momentsCreditDivisor) — showing
  // the raw AI-search-credit number here instead (e.g. "568 credits
  // required" against a Profile screen that says "20 Moments Credits
  // available") was a real, confusing unit mismatch, even though the
  // backend charge itself was correct all along.
  const displayCreditsRequired = isMoments ? toMomentsCredits(creditsRequired, pricing?.momentsCreditDivisor) : creditsRequired
  const creditsLabel = isMoments ? 'Moments Credits' : 'credits'
  // Guest (selfie-search) mode has no reel history list at all — the QR
  // token is shared across every guest at the event, so per-token history
  // would leak one guest's reel to everyone else (see the `source: 'guest'`
  // completed-stage comment below). Closing mid-generation would strand a
  // guest with zero way back to their reel, so only client/moments — both of
  // which have a real "My Reels"/Reels tab to check back into — can dismiss
  // the modal while it's still generating.
  const canCloseWhileGenerating = props.source !== 'guest'
  const reelsHomeLabel = isMoments ? 'the Reels tab' : 'My Reels'
  // 'compose' stage's photo strip needs each selected fileId's preview —
  // only ever populated for the moments source (see the props type above).
  const momentsPhotos = props.source === 'moments' ? props.momentsPhotos ?? [] : []
  const momentsPhotoById = new Map(momentsPhotos.map((p) => [p.fileId, p]))

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current) }, [])

  // Reclamps customPrompt when the compose screen's mode ACTUALLY SWITCHES —
  // text mode's cap (1900) is HIGHER than photo mode's (1750, reserves room
  // for the style fragment text mode doesn't use). Typing up to 1900 chars
  // in text mode, then adding a photo (flipping to photo mode), used to
  // leave the already-typed text over photo mode's cap with nothing to
  // truncate it — the textarea's own onChange only enforces the CURRENT
  // mode's cap as you type, not retroactively on a mode change it didn't
  // witness.
  //
  // Compares against a REF of the previous isComposeTextMode value, not
  // just "are we on the compose stage" — deliberately so this only fires on
  // a real true<->false flip, not merely on ARRIVING at 'compose' (e.g. a
  // Moments Regenerate of an old-wizard-created reel, which can legitimately
  // carry a customPrompt up to MAX_CUSTOM_PROMPT_LENGTH=2000, lands on
  // 'confirm', and can reach 'compose' again via Back without ever touching
  // photos — that legacy prompt must survive the trip, only genuine
  // photo-add/remove transitions should ever truncate anything here).
  const prevIsComposeTextModeRef = useRef(isComposeTextMode)
  useEffect(() => {
    if (stage !== 'compose') return
    if (prevIsComposeTextModeRef.current === isComposeTextMode) return
    prevIsComposeTextModeRef.current = isComposeTextMode
    const max = isComposeTextMode ? MOMENTS_TEXT_TO_VIDEO_PROMPT_MAX : MOMENTS_COMPOSE_PROMPT_MAX
    setCustomPrompt((prev) => (prev.length > max ? prev.slice(0, max) : prev))
  }, [isComposeTextMode, stage])

  useEffect(() => {
    if (stage !== 'generating' || reducedMotion) return
    const id = setInterval(() => setMsgIdx((i) => (i + 1) % GENERATING_MESSAGES.length), 4000)
    return () => clearInterval(id)
  }, [stage, reducedMotion])

  const poll = (id: string) => {
    pollRef.current = setTimeout(async () => {
      const res = await fetch(statusUrl(id)).then((r) => r.json()).catch(() => null)
      if (!res?.success) { poll(id); return }
      if (res.data.status === 'completed') {
        setOutputUrl(res.data.outputUrl)
        setStage('completed')
      } else if (res.data.status === 'failed') {
        setError(res.data.errorMessage ?? 'Something went wrong generating your reel.')
        setStage('failed')
      } else {
        if (res.data.progress) setProgress({ stage: res.data.progress.stage, percent: res.data.progress.percent })
        poll(id)
      }
    }, 3000)
  }

  // 'compose'-stage-only handlers — only ever called from Moments' fresh-
  // open photo picker, never reachable for client/guest or Regenerate.
  const addPhotoId = (fileId: string) => {
    setComposePhotoIds((prev) => (prev.includes(fileId) ? prev : [...prev, fileId]))
  }
  const removePhotoId = (fileId: string) => {
    setComposePhotoIds((prev) => prev.filter((id) => id !== fileId))
  }
  const handleUploadFromDevice = () => {
    setShowAddPhotoSheet(false)
    composeFileInputRef.current?.click()
  }
  const handleComposeFileSelected = async (file: File) => {
    if (props.source !== 'moments' || !props.onUploadPhotoForReel) return
    setUploadingPhoto(true)
    setUploadError(null)
    const fileId = await props.onUploadPhotoForReel(file).catch(() => null)
    setUploadingPhoto(false)
    if (!fileId) { setUploadError('Upload failed — try again.'); return }
    addPhotoId(fileId)
  }

  const handleGenerate = async () => {
    setStage('generating')
    setError(null)
    const trimmedPrompt = customPrompt.trim() || undefined
    const droneShotField = droneMode ? droneShot : undefined
    // Text-to-video is a completely separate request shape (no photos,
    // template, style, resolution, or duration — Kling's own endpoint takes
    // none of those, see the Moments reels route's mode:'text' branch) —
    // only ever reachable via Moments' compose screen with zero photos.
    const body = isComposeTextMode
      ? {
          mode: 'text', textPrompt: trimmedPrompt ?? '',
          aspectRatio: textAspectRatio, cfgScale: CFG_SCALE_PRESETS[cfgScalePreset],
          negativePrompt: negativePrompt.trim() || undefined,
        }
      : props.source === 'guest'
        ? { photoIds: composePhotoIds, templateId, style, resolution, durationSec, droneShot: droneShotField, customPrompt: trimmedPrompt, searchSessionId: props.searchSessionId }
        : { photoIds: composePhotoIds, templateId, style, resolution, durationSec, droneShot: droneShotField, customPrompt: trimmedPrompt } // client + moments share this shape
    const res = await fetch(createUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
    <div
      className="fixed inset-0 z-[80] bg-black/70 flex items-end sm:items-center justify-center"
      onClick={stage === 'generating' && !canCloseWhileGenerating ? undefined : onClose}
    >
      <div
        className="relative bg-card border-t sm:border border-border rounded-t-3xl sm:rounded-3xl p-6 w-full sm:max-w-md max-h-[92vh] sm:max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {stage === 'generating' && canCloseWhileGenerating && (
          <button
            onClick={onClose}
            aria-label="Continue in background"
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-border/60 hover:bg-border flex items-center justify-center text-text-primary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        {stage === 'compose' && (
          <div className="space-y-5">
            <input
              ref={composeFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) handleComposeFileSelected(file)
              }}
            />
            <div className="text-center space-y-1">
              <div className="text-3xl">✨</div>
              <h2 className="text-lg font-bold text-text-primary">Create a reel</h2>
              <p className="text-xs text-muted">Add photos to animate them, or describe a scene to generate video from scratch</p>
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Photos (optional)</p>
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
                {composePhotoIds.map((fileId) => {
                  const photo = momentsPhotoById.get(fileId)
                  return (
                    <div key={fileId} className="relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-border bg-bg">
                      {photo?.r2PreviewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo.r2PreviewUrl} alt={photo.originalFilename} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-lg">🖼️</div>
                      )}
                      <button
                        onClick={() => removePhotoId(fileId)}
                        aria-label="Remove photo"
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )
                })}
                {uploadingPhoto && (
                  <div className="flex-shrink-0 w-16 h-16 rounded-xl border border-border bg-bg flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {composePhotoIds.length < MAX_REEL_PHOTOS && !uploadingPhoto && (
                  <button
                    onClick={() => setShowAddPhotoSheet(true)}
                    aria-label="Add a photo"
                    className="flex-shrink-0 w-16 h-16 rounded-xl border-2 border-dashed border-border hover:border-accent/50 flex items-center justify-center text-2xl text-muted hover:text-accent transition-colors"
                  >
                    +
                  </button>
                )}
              </div>
              {uploadError && <p className="text-[11px] text-danger">{uploadError}</p>}
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                {isComposeTextMode ? 'Describe your video' : 'Add a note (optional)'}
              </p>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value.slice(0, isComposeTextMode ? MOMENTS_TEXT_TO_VIDEO_PROMPT_MAX : MOMENTS_COMPOSE_PROMPT_MAX))}
                placeholder={isComposeTextMode
                  ? 'e.g. A golden retriever running joyfully through a sunlit meadow, cinematic slow motion, warm afternoon light'
                  : 'e.g. Slow-motion walk together at sunset, warm golden-hour light…'}
                rows={4}
                className="w-full bg-bg border border-border rounded-2xl px-3.5 py-3 text-sm text-text-primary placeholder:text-muted/50 focus:outline-none focus:border-accent/60 resize-y transition-colors"
              />
              <p className="text-[10px] text-muted text-right">
                {customPrompt.length}/{isComposeTextMode ? MOMENTS_TEXT_TO_VIDEO_PROMPT_MAX : MOMENTS_COMPOSE_PROMPT_MAX}
              </p>
            </div>

            {!isComposeTextMode && (
              <button
                onClick={() => setStage('template')}
                className="w-full text-xs font-semibold text-accent hover:underline text-center"
              >
                🎨 Use a template instead
              </button>
            )}

            {/* Resolution/clip-length are photo-mode-only controls — Kling's
                text-to-video endpoint silently ignores both, always
                producing a fixed ~5s clip (confirmed via a real API call,
                see lambda/vayustudio-reelgen/index.js's createKlingTextToVideoTask
                header), so exposing them here would be a control that does
                nothing. Text mode gets its own different Advanced panel
                below instead (aspect ratio / prompt adherence / negative
                prompt — all confirmed accepted by the same real call,
                Phase 4). Camera movement is deliberately NOT exposed here —
                Kling accepts a `camera_control` field on this endpoint, but
                its exact schema wasn't independently confirmed the way the
                endpoint/body shape was, and a wrong guessed shape risks a
                real (if cleanly-refunded) failed generation. */}
            {isComposeTextMode ? (
              <div className="border border-border rounded-2xl overflow-hidden">
                <button
                  onClick={() => setAdvancedOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-text-primary hover:bg-border/30 transition-colors"
                >
                  <span>⚙️ Advanced (aspect ratio, style)</span>
                  <span className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`}>▾</span>
                </button>
                {advancedOpen && (
                  <div className="px-4 pb-4 space-y-3">
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Aspect ratio</p>
                      <div className="flex gap-1.5">
                        {TEXT_TO_VIDEO_ASPECT_RATIOS.map((r) => (
                          <button
                            key={r}
                            onClick={() => setTextAspectRatio(r)}
                            className={`flex-1 text-xs font-bold py-2 rounded-xl border-2 transition-all ${
                              textAspectRatio === r ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:border-accent/40'
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Prompt adherence</p>
                      <div className="flex gap-1.5">
                        {(Object.keys(CFG_SCALE_PRESETS) as CfgScalePreset[]).map((p) => (
                          <button
                            key={p}
                            onClick={() => setCfgScalePreset(p)}
                            className={`flex-1 text-xs font-bold py-2 rounded-xl border-2 transition-all ${
                              cfgScalePreset === p ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:border-accent/40'
                            }`}
                          >
                            {p.charAt(0) + p.slice(1).toLowerCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">What to avoid (optional)</p>
                      <input
                        type="text"
                        value={negativePrompt}
                        onChange={(e) => setNegativePrompt(e.target.value.slice(0, MAX_NEGATIVE_PROMPT_LENGTH))}
                        placeholder="e.g. blurry, text, watermark, extra limbs"
                        className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text-primary placeholder:text-muted/50 focus:outline-none focus:border-accent/60 transition-colors"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="border border-border rounded-2xl overflow-hidden">
                <button
                  onClick={() => setAdvancedOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-text-primary hover:bg-border/30 transition-colors"
                >
                  <span>⚙️ Advanced (quality, clip length)</span>
                  <span className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`}>▾</span>
                </button>
                {advancedOpen && (
                  <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Quality</p>
                      <div className="flex gap-1.5">
                        {REEL_RESOLUTIONS.map((r) => (
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
                      <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Clip length</p>
                      <div className="flex gap-1.5">
                        {REEL_CLIP_DURATION_OPTIONS.map((d) => {
                          const disabled = composePhotoIds.length * d > MAX_REEL_TOTAL_DURATION_SEC
                          return (
                            <button
                              key={d}
                              onClick={() => !disabled && setDurationSec(d)}
                              disabled={disabled}
                              className={`flex-1 text-xs font-bold py-2 rounded-xl border-2 transition-all ${
                                disabled
                                  ? 'border-border text-muted/40 cursor-not-allowed'
                                  : durationSec === d ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:border-accent/40'
                              }`}
                            >
                              {d}s
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="bg-bg border border-border rounded-2xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-muted">Cost</span>
              <span className="text-sm font-bold text-accent">{displayCreditsRequired} {creditsLabel}</span>
            </div>

            <label className="flex items-start gap-2.5 text-left cursor-pointer select-none">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 flex-shrink-0 accent-accent rounded"
              />
              <span className="text-[11px] text-muted leading-relaxed">
                {isComposeTextMode
                  ? 'I understand this prompt will be sent to a third-party AI video provider to create this video.'
                  : 'I understand these photos will be sent to a third-party AI video provider to create this reel. Your photos are processed only for this request and are not shared with other customers.'}
              </span>
            </label>

            <button
              onClick={handleGenerate}
              disabled={
                (isComposeTextMode ? customPrompt.trim().length < MIN_TEXT_PROMPT_LENGTH : composePhotoIds.length < MIN_REEL_PHOTOS)
                || !consentChecked
              }
              className="w-full text-sm font-bold py-3 rounded-xl text-white active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none hover:opacity-90"
              style={{ background: MOMENTS_GRADIENT }}
            >
              ✨ Generate
            </button>
          </div>
        )}

        {showAddPhotoSheet && (
          <AddReelPhotoSheet
            onUploadFromDevice={handleUploadFromDevice}
            onChooseFromGallery={() => { setShowAddPhotoSheet(false); setShowGalleryPicker(true) }}
            onClose={() => setShowAddPhotoSheet(false)}
          />
        )}

        {showGalleryPicker && (
          <ReelGalleryPickerModal
            photos={momentsPhotos}
            excludeIds={composePhotoIds}
            onPick={(fileId) => { addPhotoId(fileId); setShowGalleryPicker(false) }}
            onClose={() => setShowGalleryPicker(false)}
          />
        )}

        {stage === 'template' && (
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <div className="text-3xl">✨</div>
              <h2 className="text-lg font-bold text-text-primary">Where's this reel going?</h2>
              <p className="text-xs text-muted">{composePhotoIds.length} photos selected</p>
            </div>
            <div className="flex gap-2.5">
              {REEL_TEMPLATES.map((t) => (
                <TemplateCard key={t.id} template={t} selected={templateId === t.id} onClick={() => setTemplateId(t.id)} />
              ))}
            </div>
            {isMoments ? (
              <div className="flex gap-3">
                <button onClick={() => setStage('compose')} className="flex-1 border border-border text-text-primary text-sm font-semibold py-3 rounded-xl hover:bg-border transition-colors">Back</button>
                <button onClick={() => setStage('style')} className={primaryBtnClass} style={primaryBtnStyle}>Next →</button>
              </div>
            ) : (
              <button onClick={() => setStage('style')} className={`w-full ${primaryBtnClass}`} style={primaryBtnStyle}>
                Next →
              </button>
            )}
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

            <label className="flex items-center justify-between gap-3 cursor-pointer select-none bg-bg border border-border rounded-2xl px-4 py-3">
              <span className="flex items-center gap-2.5 min-w-0">
                <span className={`text-xl flex-shrink-0 ${droneMode && !reducedMotion ? 'animate-bounce' : ''}`}>🚁</span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-text-primary">Drone Mode</span>
                  <span className="block text-[11px] text-muted leading-tight">Sweeping aerial motion — best for outdoor shots: hills, beaches, open spaces</span>
                </span>
              </span>
              <button
                type="button" role="switch" aria-checked={droneMode}
                onClick={() => setDroneMode((v) => !v)}
                className={`relative flex-shrink-0 rounded-full transition-colors ${droneMode ? 'bg-sky-500' : 'bg-border'}`}
                style={{ height: '22px', width: '38px' }}
              >
                <span className={`absolute top-0.5 left-0.5 rounded-full bg-white shadow transition-transform ${droneMode ? 'translate-x-4' : 'translate-x-0'}`} style={{ height: '18px', width: '18px' }} />
              </button>
            </label>

            {droneMode && (
              <div className="space-y-2.5">
                <p className="text-[11px] font-bold text-sky-500 flex items-center gap-1.5">
                  <span className={reducedMotion ? '' : 'animate-spin inline-block'}>🌀</span>
                  Taking it to the skies — pick a shot!
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  {DRONE_SHOT_STYLES.map((d) => (
                    <DroneCard key={d} shot={d} selected={droneShot === d} onClick={() => setDroneShot(d)} reducedMotion={reducedMotion} />
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStage('template')} className="flex-1 border border-border text-text-primary text-sm font-semibold py-3 rounded-xl hover:bg-border transition-colors">Back</button>
              <button onClick={() => setStage('prompt')} className={primaryBtnClass} style={primaryBtnStyle}>Next →</button>
            </div>
          </div>
        )}

        {stage === 'prompt' && (
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <h2 className="text-lg font-bold text-text-primary">Add a personal touch</h2>
              <p className="text-xs text-muted">Optional — describe a moment you want to see, or skip this</p>
            </div>
            <div className="space-y-2">
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value.slice(0, MAX_CUSTOM_PROMPT_LENGTH))}
                placeholder="e.g. Slow-motion walk together at sunset… or a full shot description — candid banter, playful expressions, warm golden-hour light"
                rows={6}
                className="w-full bg-bg border border-border rounded-2xl px-3.5 py-3 text-sm text-text-primary placeholder:text-muted/50 focus:outline-none focus:border-accent/60 resize-y transition-colors"
              />
              <p className="text-[10px] text-muted text-right">{customPrompt.length}/{MAX_CUSTOM_PROMPT_LENGTH}</p>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">💡 Ideas for {REEL_STYLE_META[style].label.toLowerCase()}</p>
              <div className="flex flex-wrap gap-1.5">
                {REEL_STYLE_META[style].promptHints.map((hint) => (
                  <button
                    key={hint}
                    onClick={() => setCustomPrompt(hint.slice(0, MAX_CUSTOM_PROMPT_LENGTH))}
                    className="text-[11px] font-medium text-accent bg-accent/10 border border-accent/20 rounded-full px-2.5 py-1 hover:bg-accent/20 transition-colors"
                  >
                    {hint}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStage('style')} className="flex-1 border border-border text-text-primary text-sm font-semibold py-3 rounded-xl hover:bg-border transition-colors">Back</button>
              <button onClick={() => setStage('confirm')} className={primaryBtnClass} style={primaryBtnStyle}>Next →</button>
            </div>
          </div>
        )}

        {stage === 'confirm' && (
          <div className="space-y-5">
            <div className="text-center space-y-2">
              <div className="text-4xl">🎬</div>
              <h2 className="text-lg font-bold text-text-primary">{initial ? 'Regenerate your reel' : 'Ready to create your reel'}</h2>
              {initial && (
                <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent bg-accent/10 border border-accent/20 rounded-full px-3 py-1">
                  🔄 Same photos &amp; settings — tap Generate, or Back to change anything
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Quality</p>
                <div className="flex gap-1.5">
                  {REEL_RESOLUTIONS.map((r) => (
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
                <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Clip length</p>
                <div className="flex gap-1.5">
                  {REEL_CLIP_DURATION_OPTIONS.map((d) => {
                    // Hard total-duration ceiling (constants/videoProviders.ts)
                    // enforced here too, not just server-side — a combination
                    // that would exceed it should be unselectable, not
                    // rejected only after tapping Generate.
                    const disabled = composePhotoIds.length * d > MAX_REEL_TOTAL_DURATION_SEC
                    return (
                      <button
                        key={d}
                        onClick={() => !disabled && setDurationSec(d)}
                        disabled={disabled}
                        className={`flex-1 text-xs font-bold py-2 rounded-xl border-2 transition-all ${
                          disabled
                            ? 'border-border text-muted/40 cursor-not-allowed'
                            : durationSec === d ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:border-accent/40'
                        }`}
                      >
                        {d}s
                      </button>
                    )
                  })}
                </div>
                {composePhotoIds.length * durationSec >= MAX_REEL_TOTAL_DURATION_SEC - 2 && (
                  <p className="text-[10px] text-muted">Max total reel length is {MAX_REEL_TOTAL_DURATION_SEC}s — some lengths are greyed out at this photo count.</p>
                )}
              </div>
            </div>

            <div className="bg-bg border border-border rounded-2xl px-4 py-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted">Photos</span><span className="font-semibold text-text-primary">{composePhotoIds.length}</span></div>
              <div className="flex justify-between"><span className="text-muted">Format</span><span className="font-semibold text-text-primary">{template.icon} {template.label}</span></div>
              <div className="flex justify-between"><span className="text-muted">Style</span><span className="font-semibold text-text-primary">{REEL_STYLE_META[style].icon} {REEL_STYLE_META[style].label}</span></div>
              <div className="flex justify-between"><span className="text-muted">Quality · Length</span><span className="font-semibold text-text-primary">{resolution} · {durationSec}s/clip</span></div>
              <div className="flex justify-between"><span className="text-muted">Total reel length</span><span className="font-semibold text-text-primary">{composePhotoIds.length} × {durationSec}s = {composePhotoIds.length * durationSec}s</span></div>
              {droneMode && (
                <div className="flex justify-between"><span className="text-muted">Drone shot</span><span className="font-semibold text-text-primary">{DRONE_SHOT_META[droneShot].icon} {DRONE_SHOT_META[droneShot].label}</span></div>
              )}
              {customPrompt && (
                <div className="flex justify-between gap-3"><span className="text-muted flex-shrink-0">Your note</span><span className="font-semibold text-text-primary text-right truncate">"{customPrompt}"</span></div>
              )}
              <div className="flex justify-between border-t border-border pt-2"><span className="text-muted">Cost</span><span className="font-bold text-accent">{displayCreditsRequired} {creditsLabel}</span></div>
            </div>

            <label className="flex items-start gap-2.5 text-left cursor-pointer select-none">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 flex-shrink-0 accent-accent rounded"
              />
              <span className="text-[11px] text-muted leading-relaxed">
                I understand these {composePhotoIds.length} photos will be sent to a third-party AI video provider to create this reel. Your photos are processed only for this request and are not shared with other customers.
              </span>
            </label>

            <div className="flex gap-3">
              <button onClick={() => setStage('prompt')} className="flex-1 border border-border text-text-primary text-sm font-semibold py-3 rounded-xl hover:bg-border transition-colors">Back</button>
              <button
                onClick={handleGenerate}
                disabled={!consentChecked}
                className={primaryBtnClass}
                style={primaryBtnStyle}
              >
                ✨ Generate
              </button>
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
              <h2 className="text-base font-bold text-text-primary transition-opacity duration-500">
                {progress ? `${GENERATING_MESSAGES[msgIdx]} ${progress.percent}%` : reducedMotion ? 'Creating your reel…' : GENERATING_MESSAGES[msgIdx]}
              </h2>
              {progress && (
                <div className="h-1.5 w-40 mx-auto mt-3 rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${progress.percent}%`, background: styleGradient(style) }}
                  />
                </div>
              )}
              <p className="text-xs text-muted mt-2.5">
                {canCloseWhileGenerating
                  ? `Tap ✕ to keep browsing — you can check progress anytime from ${reelsHomeLabel}.`
                  : "This can take a few minutes. Feel free to keep browsing — it'll be ready when you come back."}
              </p>
              {creditsCharged !== null && (
                <p className="text-[11px] text-muted mt-2">
                  {isMoments ? toMomentsCredits(creditsCharged, pricing?.momentsCreditDivisor) : creditsCharged} {creditsLabel} used
                </p>
              )}
            </div>
          </div>
        )}

        {stage === 'completed' && outputUrl && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-text-primary text-center">Your reel is ready! 🎉</h2>
            <div className={`${aspectClass(template.aspectRatio)} max-h-[55vh] mx-auto rounded-2xl overflow-hidden bg-black`}>
              <video src={outputUrl} controls autoPlay className="w-full h-full object-contain" />
            </div>
            {/* Guests have no "My Reels" history (design doc §5 — the QR
                token is shared across every guest at the event, so a
                per-token history list would leak one guest's reel to
                everyone else). A shareable link to just THIS reel, sent to
                themselves, is the way a guest ever finds it again. */}
            {props.source === 'guest' && reelId && (
              <button
                onClick={() => {
                  const url = `${window.location.origin}/studio/guest/reel/${reelId}`
                  const text = `Check out my reel! 🎬✨ ${url}`
                  if (navigator.share) navigator.share({ title: 'My AI Reel', text: 'Check out my reel! 🎬✨', url }).catch(() => {})
                  else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
                }}
                className="w-full text-center text-xs font-semibold text-accent hover:underline py-1"
              >
                📲 Send this reel to yourself (so you can find it later)
              </button>
            )}
            <div className="flex gap-3">
              <a href={outputUrl} download className="flex-1 border border-border text-text-primary text-sm font-semibold py-3 rounded-xl hover:bg-border transition-colors text-center">Download</a>
              <button onClick={onClose} className={primaryBtnClass} style={primaryBtnStyle}>Done</button>
            </div>
          </div>
        )}

        {stage === 'failed' && (
          <div className="text-center space-y-4">
            <div className="text-4xl">😕</div>
            <div>
              <h2 className="text-base font-bold text-text-primary">Couldn't create your reel</h2>
              {/* Deliberately generic — the real (often technical/provider-
                  specific) failure reason is logged server-side, not shown
                  here. We already have everything needed to retry (same
                  photos/style/settings still in this modal's state), so
                  Retry re-attempts directly rather than sending the user
                  back through the whole flow. */}
              <p className="text-xs text-muted mt-1">Something went wrong on our end. Any credits used have been refunded.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 border border-border text-text-primary text-sm font-semibold py-3 rounded-xl hover:bg-border transition-colors">Close</button>
              <button onClick={handleGenerate} className={primaryBtnClass} style={primaryBtnStyle}>Retry</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
