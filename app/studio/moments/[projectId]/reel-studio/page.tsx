'use client'

// Reel Studio — full-page Kling 3.0 Omni compose experience (2026-09-30),
// replacing ReelMvpModal's cramped-modal treatment for Moments. Modeled on
// Kling's own Omni Playground (a real screenshot the user shared) as an
// interaction-pattern REFERENCE, restyled with this app's own theme —
// nothing here is a visual copy of Kling's UI. Split Input | Output layout
// on desktop, stacked on mobile.
//
// Wired to real generation (2026-09-30) — Generate really calls Kling and
// really spends credits. refer_image was already real-call-confirmed
// earlier; first_frame/last_frame/multi_shot are doc-confirmed only, NOT
// yet independently verified against a real call — the first real attempt
// using either is effectively that verification. See the small "not yet
// verified" hints near those controls below.
//
// Reliability (explicit ask, 2026-09-30 — "no memory leak, no stuck, no
// video generation lost"):
//   - Polling uses check-now (lib/studio/reelCheck.ts via the check-now
//     route), NOT a passive status read — every ~4s tick re-asks Kling
//     directly and self-heals if the reel finished but our own DB never
//     advanced (the exact production bug fixed earlier this session,
//     caused by reel-check's cron never actually being wired to a real
//     schedule). This makes "stuck on generating forever" self-correcting
//     without needing any separate manual recovery step.
//   - The poll interval is created/cleared by a single useEffect keyed on
//     [stage, reelId] — starts only while stage==='generating', and its
//     cleanup function (returned from the effect) always clearInterval()s
//     before a new one can start or on unmount. No possibility of two
//     overlapping intervals or one leaking past unmount.
//   - Nothing generation-related is held only in this page's local state —
//     reelId/jobId are persisted server-side the instant the Kling task is
//     created (see the reels route's own try/catch-refund block), so
//     closing this tab mid-generation loses nothing; the Reels tab (with
//     its own "Check now") can always pick it back up later.
//
// Deliberately simple mention system per explicit scope decision: a plain
// textarea with an "@" popover that inserts literal "@tag" text, NOT a
// full contenteditable rich-pill editor like Kling's own — much smaller
// build, still solves the real problem (pasting a prompt from ChatGPT/
// Claude never requires the user to hand-type Kling's @tag syntax).
//
// First Frame / Last Frame are deliberately NOT part of the @-mentionable
// pool (matching the reference screenshot — the sample prompt never
// verbally mentions "First Frame" by name, only the plain numbered
// reference images get mentioned in prose). They're structural picks, not
// narrative references — the server never requires (or checks for) a
// prompt mention for these two.
//
// Feature Video / Base Video / Element stay visibly present but disabled
// ("Coming soon") — per the standing decision to hold those until their
// own docs/creation flow are available, while still showing the room this
// page is built to grow into (the user's own "multiple features" framing).

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { MediaFile } from '@/types/studio'
import { toMomentsCredits } from '@/constants/studioPricing'
import {
  computeOmniVideoCost, OMNI_RESOLUTIONS, DEFAULT_OMNI_RESOLUTION,
  TEXT_TO_VIDEO_ASPECT_RATIOS, DEFAULT_TEXT_TO_VIDEO_ASPECT_RATIO,
  MOMENTS_COMPOSE_PROMPT_MAX, OMNI_MAX_REFERENCE_IMAGES,
  DEFAULT_AI_CLIP_DURATION_SEC,
} from '@/constants/videoProviders'
import type { PricingConfig } from '@/types/pricingConfig'
import ReelGalleryPickerModal, { type ReelPickerPhoto } from '@/components/studio/moments/ReelGalleryPickerModal'

const GRADIENT = 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)'
const MIN_DURATION_SEC = 3
const MAX_DURATION_SEC = 15
const POLL_INTERVAL_MS = 4000

type PickerTarget = 'first_frame' | 'last_frame' | 'reference'
type Stage = 'compose' | 'submitting' | 'generating' | 'completed' | 'failed'

export default function ReelStudioPage({ params }: { params: { projectId: string } }) {
  const router = useRouter()
  const { projectId } = params

  const [notFound, setNotFound] = useState(false)
  const [eventName, setEventName] = useState<string | null>(null)
  const [photos, setPhotos] = useState<ReelPickerPhoto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/studio/api/auth/me')
      .then((r) => r.json())
      .then((res) => {
        if (!res.success || !res.data || res.data.role !== 'CLIENT') {
          router.replace(`/studio/login?next=/studio/moments/${projectId}/reel-studio`)
          return
        }
        return fetch(`/studio/api/moments/events/${projectId}`)
          .then((r) => r.json())
          .then((eventRes) => {
            if (!eventRes.success) { setNotFound(true); return }
            setEventName(eventRes.data.clientName ?? null)
            return fetch(`/studio/api/moments/events/${projectId}/files`)
              .then((r) => r.json())
              .then((filesRes) => {
                if (filesRes.success) {
                  const images = (filesRes.data as MediaFile[])
                    .filter((f) => f.fileType === 'IMAGE' && f.r2PreviewUrl)
                    .map((f) => ({ fileId: f.fileId, r2PreviewUrl: f.r2PreviewUrl, originalFilename: f.originalFilename }))
                  setPhotos(images)
                }
              })
          })
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [projectId, router])

  // ── Asset slots ──────────────────────────────────────────────────────────
  const [firstFrameId, setFirstFrameId] = useState<string | null>(null)
  const [lastFrameId, setLastFrameId] = useState<string | null>(null)
  const [referenceIds, setReferenceIds] = useState<string[]>([])
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null)

  const usedIds = [firstFrameId, lastFrameId, ...referenceIds].filter((x): x is string => !!x)
  const referenceTags = referenceIds.map((_, i) => `image_${i + 1}`)
  const photoById = new Map(photos.map((p) => [p.fileId, p]))

  const handlePick = (fileId: string) => {
    if (pickerTarget === 'first_frame') setFirstFrameId(fileId)
    else if (pickerTarget === 'last_frame') setLastFrameId(fileId)
    else if (pickerTarget === 'reference') setReferenceIds((prev) => [...prev, fileId])
    setPickerTarget(null)
  }

  // ── Prompt + @ mention popover ───────────────────────────────────────────
  const [prompt, setPrompt] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null)

  const detectMention = useCallback((value: string, cursor: number) => {
    const upToCursor = value.slice(0, cursor)
    const at = upToCursor.lastIndexOf('@')
    if (at === -1) { setMention(null); return }
    const between = upToCursor.slice(at + 1)
    // A completed mention or plain text — if there's whitespace between the
    // @ and the cursor, the user has moved on, so the popover shouldn't
    // still be open.
    if (/\s/.test(between)) { setMention(null); return }
    setMention({ start: at, query: between.toLowerCase() })
  }, [])

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value.slice(0, MOMENTS_COMPOSE_PROMPT_MAX)
    setPrompt(value)
    detectMention(value, e.target.selectionStart ?? value.length)
  }

  // mousedown (not click) so the textarea never loses focus/selection
  // before the insertion happens — losing selectionStart would insert at
  // the wrong place.
  const insertMention = (tag: string) => {
    if (!mention) return
    const el = textareaRef.current
    const cursor = el?.selectionStart ?? prompt.length
    const before = prompt.slice(0, mention.start)
    const after = prompt.slice(cursor)
    const next = `${before}@${tag} ${after}`.slice(0, MOMENTS_COMPOSE_PROMPT_MAX)
    setPrompt(next)
    setMention(null)
    requestAnimationFrame(() => {
      const pos = before.length + tag.length + 2
      el?.focus()
      el?.setSelectionRange(pos, pos)
    })
  }

  // Reference chips are also directly clickable (not just @-typeable) —
  // same "tap to mention" affordance ReelMvpModal already had, now
  // inserting at the real cursor position instead of always appending.
  const insertMentionAtCursor = (tag: string) => {
    const el = textareaRef.current
    const cursor = el?.selectionStart ?? prompt.length
    const marker = `@${tag}`
    if (prompt.includes(marker)) return
    const sep = prompt.slice(0, cursor).trim().length > 0 && prompt[cursor - 1] !== ' ' ? ' ' : ''
    const next = `${prompt.slice(0, cursor)}${sep}${marker} ${prompt.slice(cursor)}`.slice(0, MOMENTS_COMPOSE_PROMPT_MAX)
    setPrompt(next)
  }

  const mentionMatches = mention
    ? referenceTags.filter((t) => t.toLowerCase().includes(mention.query))
    : []

  // ── Settings ─────────────────────────────────────────────────────────────
  const [durationSec, setDurationSec] = useState(DEFAULT_AI_CLIP_DURATION_SEC)
  const [aspectRatio, setAspectRatio] = useState<(typeof TEXT_TO_VIDEO_ASPECT_RATIOS)[number]>(DEFAULT_TEXT_TO_VIDEO_ASPECT_RATIO)
  const [resolution, setResolution] = useState<(typeof OMNI_RESOLUTIONS)[number]>(DEFAULT_OMNI_RESOLUTION)
  const [generateAudio, setGenerateAudio] = useState(false)
  const [multiShot, setMultiShot] = useState(true)
  const [consentChecked, setConsentChecked] = useState(false)
  const outputRef = useRef<HTMLDivElement>(null)

  const [stage, setStage] = useState<Stage>('compose')
  const [reelId, setReelId] = useState<string | null>(null)
  const [creditsCharged, setCreditsCharged] = useState<number | null>(null)
  const [outputUrl, setOutputUrl] = useState<string | null>(null)
  // No fake percentage — the provider's own status check has no percent/ETA
  // field at all (confirmed against its real response schema), only a
  // coarse status. Showing a fabricated number that sits near 0% for most
  // of the wait and then jumps is worse than being honest: a real stage
  // label (from the same stage reel-check/check-now already tracks) plus
  // real elapsed time.
  const [progressStage, setProgressStage] = useState<string | null>(null)
  const [generatingStartedAt, setGeneratingStartedAt] = useState<number | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [pricing, setPricing] = useState<PricingConfig | null>(null)
  useEffect(() => {
    fetch('/studio/api/pricing-config').then((r) => r.json()).then((d) => { if (d.success) setPricing(d.data) }).catch(() => {})
  }, [])

  const cost = computeOmniVideoCost(durationSec, resolution, false, generateAudio, pricing ?? undefined)
  const displayCredits = toMomentsCredits(cost.creditsRequired, pricing?.momentsCreditDivisor)

  const allTagsMentioned = referenceTags.every((t) => prompt.includes(`@${t}`))
  const canGenerate = stage === 'compose' && prompt.trim().length > 0 && allTagsMentioned && consentChecked && usedIds.length > 0

  // Exactly what's sent, given the current form state — shown live in the
  // Output panel, mirroring the reference screenshot's own layout.
  const assembledPrompt = prompt.trim()

  const handleGenerate = async () => {
    if (!canGenerate) return
    setStage('submitting')
    setSubmitError(null)
    outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    try {
      const res = await fetch(`/studio/api/moments/events/${projectId}/reels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'omni',
          prompt: assembledPrompt,
          references: referenceIds.map((fileId, i) => ({ kind: 'image', tag: `image_${i + 1}`, fileId })),
          firstFrameFileId: firstFrameId ?? undefined,
          lastFrameFileId: lastFrameId ?? undefined,
          durationSec, aspectRatio, resolution, generateAudio, multiShot,
        }),
      }).then((r) => r.json())
      if (!res.success) {
        setSubmitError(res.message ?? 'Could not start generation — please try again.')
        setStage('compose')
        return
      }
      setReelId(res.data.reelId)
      setCreditsCharged(res.data.creditsCharged)
      setProgressStage('generating')
      setGeneratingStartedAt(Date.now())
      setStage('generating')
    } catch (err) {
      console.error('[reel-studio generate]', err)
      setSubmitError('Network error — please try again.')
      setStage('compose')
    }
  }

  // Polls check-now (not a passive status read) — see the file header
  // comment for why this is the "no stuck" guarantee. Single interval,
  // created and cleared by this one effect only — no other code path ever
  // starts a competing poll for the same reel.
  useEffect(() => {
    if (stage !== 'generating' || !reelId) return
    let cancelled = false
    const tick = async () => {
      try {
        const res = await fetch(`/studio/api/moments/events/${projectId}/reels/${reelId}/check-now`, { method: 'POST' }).then((r) => r.json())
        if (cancelled || !res.success) return
        const data = res.data as { status: string; outputUrl: string | null; errorMessage: string | null }
        // The reel's own status ('generating'/'assembling') directly, not
        // the job's internal progress object — that one goes null the
        // moment status flips to 'assembling' (see check-now's own route),
        // which would otherwise freeze this label on "Generating…" forever.
        setProgressStage(data.status)
        if (data.status === 'completed') {
          setOutputUrl(data.outputUrl)
          setStage('completed')
        } else if (data.status === 'failed') {
          setErrorMessage(data.errorMessage)
          setStage('failed')
        }
      } catch (err) {
        // A single failed poll tick is a transient network hiccup, not a
        // generation failure — the next tick just retries. Never surfaces
        // as an error state on its own.
        console.error('[reel-studio poll]', err)
      }
    }
    tick()
    const id = setInterval(tick, POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [stage, reelId, projectId])

  // Real elapsed time, ticked client-side once a second — separate from
  // the 4s check-now poll above so the clock stays smooth between polls.
  // Cleared the same way: single interval owned by this effect, torn down
  // on stage change or unmount.
  useEffect(() => {
    if (stage !== 'generating' || !generatingStartedAt) return
    const id = setInterval(() => setElapsedSec(Math.floor((Date.now() - generatingStartedAt) / 1000)), 1000)
    return () => clearInterval(id)
  }, [stage, generatingStartedAt])

  const PROGRESS_STAGE_LABEL: Record<string, string> = {
    generating: 'Generating your reel…',
    assembling: 'Finishing up…',
    finalizing: 'Almost done…',
  }

  const handleMakeAnother = () => {
    setStage('compose')
    setReelId(null)
    setCreditsCharged(null)
    setOutputUrl(null)
    setProgressStage(null)
    setGeneratingStartedAt(null)
    setElapsedSec(0)
    setErrorMessage(null)
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-bg"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
  }
  if (notFound) {
    return <div className="min-h-screen flex items-center justify-center bg-bg text-muted text-sm">Couldn't load this event.</div>
  }

  return (
    <div className="min-h-screen bg-bg">
      <div className="sticky top-0 z-10 bg-card border-b border-border pt-[env(safe-area-inset-top)]">
        <div className="px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href={`/studio/moments/${projectId}?tab=reels`} className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-border/60 text-muted hover:text-text-primary transition-colors">
            <svg className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="min-w-0">
            <p className="text-sm font-bold text-text-primary truncate">Reel Studio</p>
            <p className="text-[11px] text-muted truncate">{eventName ?? 'Moments'} · AI Reel Studio</p>
          </div>
          <span className="ml-auto flex-shrink-0 text-[9px] sm:text-[10px] font-bold text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 sm:px-2.5 py-1">BETA</span>
        </div>
      </div>

      {/* Extra bottom padding on mobile clears the fixed Review bar (see
          below) so the last settings/consent controls are never hidden
          behind it. Desktop has no fixed bar, so no extra padding needed. */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6 pb-28 lg:pb-6">
        {/* ── Input panel ──────────────────────────────────────────────── */}
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Reference assets</p>
            <div className="flex flex-wrap gap-2">
              <AssetTile
                label="First Frame"
                photo={firstFrameId ? photoById.get(firstFrameId) : undefined}
                onAdd={() => setPickerTarget('first_frame')}
                onRemove={() => setFirstFrameId(null)}
              />
              {referenceIds.map((fileId, i) => (
                <AssetTile
                  key={fileId}
                  label={`Image ${i + 1}`}
                  photo={photoById.get(fileId)}
                  onRemove={() => setReferenceIds((prev) => prev.filter((id) => id !== fileId))}
                  onClick={() => insertMentionAtCursor(`image_${i + 1}`)}
                  clickable
                />
              ))}
              {referenceIds.length < OMNI_MAX_REFERENCE_IMAGES && (
                <AssetTile label="Add image" onAdd={() => setPickerTarget('reference')} />
              )}
              <AssetTile
                label="Last Frame"
                photo={lastFrameId ? photoById.get(lastFrameId) : undefined}
                onAdd={firstFrameId ? () => setPickerTarget('last_frame') : undefined}
                onRemove={() => setLastFrameId(null)}
                disabledHint={!firstFrameId ? 'Set a First Frame first' : undefined}
              />
              <AssetTile label="Feature Video" comingSoon />
              <AssetTile label="Base Video" comingSoon />
              <AssetTile label="Element" comingSoon />
            </div>
            <p className="text-[10px] text-muted leading-relaxed">
              First/Last Frame are used automatically — no need to mention them in your description. Only images added via <span className="font-semibold text-text-primary">"+ Add image"</span> show up when you type @.
            </p>
            {(firstFrameId || lastFrameId) && (
              <p className="text-[10px] text-amber-600">⚠️ First/Last Frame are new — not yet verified against a real generation. If something looks off, try again with just reference images.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Describe your short film</p>
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={handlePromptChange}
                onKeyUp={(e) => detectMention(prompt, e.currentTarget.selectionStart ?? prompt.length)}
                onClick={(e) => detectMention(prompt, e.currentTarget.selectionStart ?? prompt.length)}
                onBlur={() => setTimeout(() => setMention(null), 150)}
                placeholder={'Paste a prompt from ChatGPT/Claude, or write your own. Describe shots in plain language — "Shot 1 — wide shot: ...; Shot 2 — close-up: ...". Type @ to mention a reference image.'}
                rows={6}
                className="w-full sm:min-h-[220px] bg-card border border-border rounded-2xl px-3.5 py-3 text-sm text-text-primary placeholder:text-muted/50 focus:outline-none focus:border-accent/60 resize-y transition-colors font-mono"
              />
              {mention && mentionMatches.length > 0 && (
                <div className="absolute left-3 right-3 top-full mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden z-20">
                  {mentionMatches.map((tag) => {
                    const idx = referenceTags.indexOf(tag)
                    const fileId = referenceIds[idx]
                    const photo = photoById.get(fileId)
                    return (
                      <button
                        key={tag}
                        onMouseDown={(e) => { e.preventDefault(); insertMention(tag) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-border/40 transition-colors"
                      >
                        {photo?.r2PreviewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photo.r2PreviewUrl} alt="" className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
                        ) : <span className="w-7 h-7 rounded-lg bg-border flex-shrink-0" />}
                        <span className="text-xs font-semibold text-text-primary">@{tag}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted">{prompt.length}/{MOMENTS_COMPOSE_PROMPT_MAX}</p>
              {!allTagsMentioned && referenceTags.length > 0 && (
                <p className="text-[10px] text-danger">Mention every added image in your description (tap it, or type @)</p>
              )}
            </div>
          </div>

          <div className="border border-border rounded-2xl p-4 space-y-3 bg-card">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Settings</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Duration</p>
                {/* Explicit -/+ buttons, not just the bare <input type="number">
                    this used to be — iOS Safari hides native number-input spin
                    buttons entirely (Android support is inconsistent too), so
                    on mobile there was no way to adjust this except typing
                    directly into the field, which isn't discoverable. */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDurationSec((d) => Math.max(MIN_DURATION_SEC, d - 1))}
                    disabled={durationSec <= MIN_DURATION_SEC}
                    aria-label="Decrease duration"
                    className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg border border-border text-text-primary hover:border-accent/50 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" /></svg>
                  </button>
                  <input
                    type="number" inputMode="numeric" min={MIN_DURATION_SEC} max={MAX_DURATION_SEC}
                    value={durationSec}
                    onChange={(e) => setDurationSec(Math.min(MAX_DURATION_SEC, Math.max(MIN_DURATION_SEC, parseInt(e.target.value, 10) || MIN_DURATION_SEC)))}
                    className="w-14 bg-bg border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary text-center focus:outline-none focus:border-accent/60"
                  />
                  <button
                    type="button"
                    onClick={() => setDurationSec((d) => Math.min(MAX_DURATION_SEC, d + 1))}
                    disabled={durationSec >= MAX_DURATION_SEC}
                    aria-label="Increase duration"
                    className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg border border-border text-text-primary hover:border-accent/50 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" /></svg>
                  </button>
                  <span className="text-[10px] text-muted">sec ({MIN_DURATION_SEC}–{MAX_DURATION_SEC})</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Aspect ratio</p>
                <div className="flex gap-1.5">
                  {TEXT_TO_VIDEO_ASPECT_RATIOS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setAspectRatio(r)}
                      className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg border-2 transition-all ${aspectRatio === r ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:border-accent/40'}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Resolution</p>
                <div className="flex gap-1.5">
                  {OMNI_RESOLUTIONS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setResolution(r)}
                      className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg border-2 transition-all ${resolution === r ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:border-accent/40'}`}
                    >
                      {r === '4k' ? '4K' : r}
                    </button>
                  ))}
                </div>
                {resolution === '4k' && <p className="text-[10px] text-amber-500 font-medium">4K costs significantly more</p>}
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Multi-shot</p>
                <div className="flex gap-1.5">
                  {[true, false].map((v) => (
                    <button
                      key={String(v)}
                      onClick={() => setMultiShot(v)}
                      className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg border-2 transition-all ${multiShot === v ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:border-accent/40'}`}
                    >
                      {v ? 'On' : 'Off'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <label className="flex items-center justify-between gap-3 select-none bg-bg border border-border rounded-xl px-3 py-2.5 cursor-pointer">
              <span className="min-w-0">
                <span className="block text-xs font-bold text-text-primary">🔊 Native audio</span>
                <span className="block text-[10px] text-muted leading-tight">Sound generated to match the scene</span>
              </span>
              <button
                type="button" role="switch" aria-checked={generateAudio}
                onClick={() => setGenerateAudio((v) => !v)}
                className={`relative flex-shrink-0 rounded-full transition-colors ${generateAudio ? 'bg-accent' : 'bg-border'}`}
                style={{ height: '22px', width: '38px' }}
              >
                <span className={`absolute top-0.5 left-0.5 rounded-full bg-white shadow transition-transform ${generateAudio ? 'translate-x-4' : 'translate-x-0'}`} style={{ height: '18px', width: '18px' }} />
              </button>
            </label>
          </div>

          {/* Desktop-only inline cost tile — mobile shows cost inside the
              fixed bottom action bar instead (see below), so it stays
              visible without scrolling all the way down. */}
          <div className="hidden lg:flex bg-card border border-border rounded-2xl px-4 py-3 items-center justify-between">
            <span className="text-sm text-muted">Cost</span>
            <span className="text-sm font-bold text-accent">{displayCredits} Moments Credits</span>
          </div>

          <label className="flex items-start gap-2.5 text-left cursor-pointer select-none">
            <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} className="mt-0.5 w-4 h-4 flex-shrink-0 accent-accent rounded" />
            <span className="text-[11px] text-muted leading-relaxed">I understand these assets will be sent to a third-party AI video provider to create this reel.</span>
          </label>

          {submitError && <p className="text-[11px] text-danger">{submitError}</p>}

          {/* Desktop-only inline button — mobile uses the fixed bottom bar
              version instead, a common pattern for long forms so the
              primary action never requires scrolling to find. */}
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="hidden lg:block w-full text-sm font-bold py-3 rounded-xl text-white active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none hover:opacity-90"
            style={{ background: GRADIENT }}
          >
            {stage === 'submitting' ? 'Starting…' : '✨ Generate'}
          </button>
        </div>

        {/* Mobile-only fixed action bar (cost + button together) — clears
            the pb-28 padding added on the outer grid above. */}
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-20 bg-card border-t border-border px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex items-center gap-3">
          <div className="flex-shrink-0 leading-tight">
            <p className="text-[9px] text-muted">Cost</p>
            <p className="text-sm font-bold text-accent">{displayCredits} credits</p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="flex-1 text-sm font-bold py-3 rounded-xl text-white active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none hover:opacity-90"
            style={{ background: GRADIENT }}
          >
            {stage === 'submitting' ? 'Starting…' : '✨ Generate'}
          </button>
        </div>

        {/* ── Output panel ─────────────────────────────────────────────── */}
        <div ref={outputRef} className="space-y-4 lg:sticky lg:top-20 lg:self-start scroll-mt-20">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-text-primary">Output</p>
            <p className="text-[10px] text-muted">Results are kept for 30 days</p>
          </div>

          <div className="border border-border rounded-2xl p-4 bg-card space-y-3">
            <p className="text-xs text-text-primary leading-relaxed whitespace-pre-wrap">{assembledPrompt || <span className="text-muted">Your description will appear here…</span>}</p>
            {usedIds.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {firstFrameId && <MiniThumb photo={photoById.get(firstFrameId)} label="First" />}
                {referenceIds.map((id, i) => <MiniThumb key={id} photo={photoById.get(id)} label={`${i + 1}`} />)}
                {lastFrameId && <MiniThumb photo={photoById.get(lastFrameId)} label="Last" />}
              </div>
            )}
          </div>

          {(stage === 'compose' || stage === 'submitting') && (
            <div className="border border-dashed border-border rounded-2xl w-full max-w-[300px] aspect-[9/16] mx-auto flex flex-col items-center justify-center gap-2 bg-card/50 px-6 text-center">
              <span className="text-3xl">🎬</span>
              <p className="text-[11px] text-muted leading-relaxed">
                {stage === 'submitting' ? 'Starting generation…' : 'Fill in the details on the left, then tap "Generate".'}
              </p>
            </div>
          )}

          {stage === 'generating' && (
            <div className="border border-border rounded-2xl w-full max-w-[300px] aspect-[9/16] mx-auto flex flex-col items-center justify-center gap-3 bg-card/50 px-6 text-center">
              <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-bold text-text-primary">{PROGRESS_STAGE_LABEL[progressStage ?? 'generating'] ?? 'Generating your reel…'}</p>
              <p className="text-[11px] text-muted tabular-nums">{elapsedSec}s elapsed</p>
              <p className="text-[10px] text-muted leading-relaxed">We're checking in automatically — you can leave this page, your reel will keep going and show up in the Reels tab.</p>
            </div>
          )}

          {stage === 'completed' && outputUrl && (
            <div className="space-y-2">
              <video src={outputUrl} controls autoPlay muted playsInline className="w-full max-w-[300px] mx-auto rounded-2xl bg-black" />
              <div className="flex gap-2 max-w-[300px] mx-auto">
                <a href={outputUrl} download className="flex-1 text-center text-xs font-semibold text-text-primary border border-border rounded-xl py-2.5 hover:bg-border/40 transition-colors">Download</a>
                <button onClick={handleMakeAnother} className="flex-1 text-xs font-bold text-white rounded-xl py-2.5 hover:opacity-90 transition-opacity" style={{ background: GRADIENT }}>Make another</button>
              </div>
              {creditsCharged !== null && <p className="text-[10px] text-muted text-center">{toMomentsCredits(creditsCharged, pricing?.momentsCreditDivisor)} Moments Credits used</p>}
            </div>
          )}

          {stage === 'failed' && (
            <div className="border border-danger/30 bg-danger/5 rounded-2xl w-full max-w-[300px] aspect-[9/16] mx-auto flex flex-col items-center justify-center gap-2 px-6 text-center">
              <span className="text-3xl">😕</span>
              <p className="text-xs font-bold text-text-primary">Something went wrong</p>
              <p className="text-[11px] text-muted leading-relaxed">{errorMessage ?? 'Generation failed.'} Any credits used were refunded.</p>
              <button onClick={handleMakeAnother} className="text-xs font-bold text-white rounded-xl px-4 py-2 hover:opacity-90 transition-opacity" style={{ background: GRADIENT }}>Try again</button>
            </div>
          )}
        </div>
      </div>

      {pickerTarget && (
        <ReelGalleryPickerModal
          photos={photos}
          excludeIds={usedIds}
          onPick={handlePick}
          onClose={() => setPickerTarget(null)}
        />
      )}
    </div>
  )
}

function MiniThumb({ photo, label }: { photo?: ReelPickerPhoto; label: string }) {
  return (
    <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-border bg-bg flex-shrink-0">
      {photo?.r2PreviewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.r2PreviewUrl} alt="" className="w-full h-full object-cover" />
      ) : null}
      <span className="absolute bottom-0 right-0 text-[8px] font-bold text-white bg-black/60 px-1 rounded-tl-md">{label}</span>
    </div>
  )
}

function AssetTile({ label, photo, onAdd, onRemove, onClick, clickable, comingSoon, disabledHint }: {
  label: string
  photo?: ReelPickerPhoto
  onAdd?: () => void
  onRemove?: () => void
  onClick?: () => void
  clickable?: boolean
  comingSoon?: boolean
  disabledHint?: string
}) {
  if (comingSoon) {
    return (
      <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl border-2 border-dashed border-border/60 flex flex-col items-center justify-center gap-1 opacity-50" title="Coming soon">
        <span className="text-lg">+</span>
        <span className="text-[9px] text-muted text-center px-1 leading-tight">{label}</span>
        <span className="absolute top-1 right-1 text-[7px] font-bold text-muted bg-border rounded-full px-1">SOON</span>
      </div>
    )
  }
  if (!photo) {
    return (
      <button
        onClick={onAdd}
        disabled={!onAdd}
        title={disabledHint}
        className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl border-2 border-dashed border-border hover:border-accent/50 flex flex-col items-center justify-center gap-1 text-muted hover:text-accent transition-colors disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted"
      >
        <span className="text-lg">+</span>
        <span className="text-[9px] text-center px-1 leading-tight">{label}</span>
      </button>
    )
  }
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border-2 border-border bg-bg ${clickable ? 'cursor-pointer hover:border-accent/50' : ''}`}
    >
      {photo.r2PreviewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.r2PreviewUrl} alt={photo.originalFilename} className="w-full h-full object-cover pointer-events-none" />
      ) : null}
      <span className="absolute bottom-0 inset-x-0 text-[9px] font-bold text-white bg-black/60 text-center py-0.5 truncate px-1">{label}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove?.() }}
        aria-label={`Remove ${label}`}
        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-colors"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
