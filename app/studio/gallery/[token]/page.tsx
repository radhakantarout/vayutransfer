'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import type { StudioProject, MediaFile, Selection, StudioFace } from '@/types/studio'
import SelfieSearchModal from '@/components/studio/SelfieSearchModal'
import InAppBrowserGuard from '@/components/studio/InAppBrowserGuard'
import PhotoLightbox, { type LightboxPhoto } from '@/components/studio/PhotoLightbox'

interface GalleryFile extends MediaFile {
  isSelected: boolean
  editingRequired: boolean
  comment: string
}

interface EventOverview {
  project: StudioProject
  coverUrl: string | null
  photoCount: number
  lovedCount: number
  editCount: number
  isSubmitted: boolean
  submittedAt: string | null
}

type ViewMode   = 'grid' | 'lightbox'
type ViewFilter = 'all' | 'loved' | 'edit'

// Deterministic "random-looking" pick for a group card's photo stack — same
// helper as EventSection.tsx's admin AI Face tab, so the stack looks stable
// across re-renders instead of reshuffling on every selection/search change.
function pickStableRandom<T>(arr: T[], seed: string, count: number): T[] {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) >>> 0
    const j = h % (i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, count)
}

function HeartIcon({ filled, className }: { filled?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} stroke="currentColor" strokeWidth={1.8} fill={filled ? 'currentColor' : 'none'}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" />
    </svg>
  )
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <circle cx="5"  cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  )
}

function fmtEventType(t: string) {
  return t.replace(/_/g, ' ')
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ── Overview page ──────────────────────────────────────────────────────────────

function GalleryOverview({
  events, clientName, studioName, totalLoved, totalEdit, totalSubmitted, token,
}: {
  events: EventOverview[]
  clientName: string
  studioName: string
  totalLoved: number
  totalEdit: number
  totalSubmitted: number
  token: string
}) {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-bg pb-24">
      <InAppBrowserGuard />

      {/* Header */}
      <div className="sticky top-0 z-20 bg-bg/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <div className="font-bold text-text-primary text-sm">{clientName}</div>
            <div className="text-xs text-muted">{studioName}</div>
          </div>
          <div className="text-xs font-semibold text-text-primary bg-accent/10 border border-accent/20 rounded-full px-3 py-1">
            My Gallery
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4">

        {/* Section title */}
        <div>
          <h1 className="text-lg font-bold text-text-primary">Your Events</h1>
          <p className="text-xs text-muted mt-0.5">Tap an event to view and select your favourite photos</p>
        </div>

        {/* Event cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {events.map(ev => (
            <button
              key={ev.project.projectId}
              onClick={() => router.push(`/studio/gallery/${token}?event=${ev.project.projectId}`)}
              className="group relative bg-card border border-border rounded-2xl overflow-hidden text-left transition-all hover:border-accent/40 hover:shadow-md hover:shadow-accent/10 active:scale-[0.98]"
            >
              {/* Cover photo */}
              <div className="relative aspect-[4/3] bg-border/40 overflow-hidden">
                {ev.coverUrl ? (
                  <img
                    src={ev.coverUrl}
                    alt={fmtEventType(ev.project.eventType)}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-muted/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 9.75h.008v.008H3V9.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm13.5 0h.008v.008h-.008V9.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                    </svg>
                  </div>
                )}
                {/* Submitted badge */}
                {ev.isSubmitted && (
                  <div className="absolute top-2 right-2 bg-success text-bg text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                    Submitted
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-3 space-y-1.5">
                <div>
                  <p className="text-xs font-bold text-text-primary leading-tight">{fmtEventType(ev.project.eventType)}</p>
                  <p className="text-[10px] text-muted">{fmtDate(ev.project.eventDate)}</p>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-muted">
                  <span>{ev.photoCount} photos</span>
                </div>

                {(ev.lovedCount > 0 || ev.editCount > 0) && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {ev.lovedCount > 0 && (
                      <span className="flex items-center gap-1 text-[11px] text-rose-500 font-semibold">
                        <HeartIcon filled className="w-3 h-3" />
                        {ev.lovedCount}
                      </span>
                    )}
                    {ev.editCount > 0 && (
                      <span className="text-[11px] text-orange-400 font-semibold">✏ {ev.editCount}</span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-accent font-semibold group-hover:underline">
                    View Gallery →
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Total summary bar */}
        {(totalLoved > 0 || totalEdit > 0 || totalSubmitted > 0) && (
          <div className="bg-card border border-border rounded-2xl px-4 py-3">
            <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2">Your Total Selections</p>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5">
                <HeartIcon filled className="w-4 h-4 text-rose-500" />
                <span className="text-sm font-bold text-text-primary">{totalLoved}</span>
                <span className="text-xs text-muted">loved</span>
              </div>
              {totalEdit > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-base">✏️</span>
                  <span className="text-sm font-bold text-text-primary">{totalEdit}</span>
                  <span className="text-xs text-muted">need editing</span>
                </div>
              )}
              {totalSubmitted > 0 && (
                <div className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-bold text-text-primary">{totalSubmitted}</span>
                  <span className="text-xs text-muted">event{totalSubmitted !== 1 ? 's' : ''} submitted</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Per-event gallery view ─────────────────────────────────────────────────────

function EventGalleryView({ token, projectId }: { token: string; projectId: string }) {
  const router = useRouter()

  const [project, setProject]         = useState<StudioProject | null>(null)
  const [files, setFiles]             = useState<GalleryFile[]>([])
  // Snapshot of what was actually last submitted (or empty, if never submitted).
  // The bar/dirty-check compares live `files` against this — never mutated except
  // right after load() and right after a successful submit.
  const [baseline, setBaseline]       = useState<GalleryFile[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [viewMode, setViewMode]       = useState<ViewMode>('grid')
  const [lightboxIdx, setLightboxIdx] = useState(0)
  const [showSubmit, setShowSubmit]             = useState(false)
  const [submitting, setSubmitting]             = useState(false)
  const [submitted, setSubmitted]               = useState(false)
  const [submittedAt, setSubmittedAt]           = useState<string | null>(null)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [countdown, setCountdown]               = useState('')
  const [showSelectionPreview, setShowSelectionPreview] = useState(false)
  const [selectionPreviewIdx, setSelectionPreviewIdx]   = useState(0)
  const [openMenu, setOpenMenu]                 = useState<string | null>(null)
  const touchStartX                             = useRef<number>(0)
  // Same floating glass zoom bar (2-10 columns) the studio admin's own
  // gallery grid uses — ported so client and admin zoom controls feel
  // identical, and so it works equally well as a drag target on mobile
  // (where most clients will actually be browsing) and desktop.
  const [zoomLevel, setZoomLevel]       = useState(4)
  const zoomTrackRef                    = useRef<HTMLDivElement>(null)
  const [viewFilter, setViewFilter]     = useState<ViewFilter>('all')
  const [showSelfie, setShowSelfie]     = useState(false)
  const [selfieFiles, setSelfieFiles]   = useState<MediaFile[] | null>(null)
  // AI Face groups (Bride/Groom/Couple/etc.), mirroring the admin AI Face
  // tab — null/empty just means no strip renders, never an error state.
  const [faceGroups, setFaceGroups]         = useState<StudioFace[] | null>(null)
  const [faceGroupFilter, setFaceGroupFilter] = useState<{ faceId: string; label?: string; fileIds: Set<string> } | null>(null)
  // Per-tile thumbnail load state — undefined defaults to "loading" so a fresh
  // tile shows the spinner until its <img> fires onLoad/onError.
  const [imgStatus, setImgStatus]       = useState<Record<string, 'loaded' | 'error'>>({})
  const [imgRetry, setImgRetry]         = useState<Record<string, number>>({})

  const draftKey = `vayu_gallery_draft_${token}_${projectId}`
  const retryImage = (fileId: string) => {
    setImgStatus((s) => { const next = { ...s }; delete next[fileId]; return next })
    setImgRetry((r) => ({ ...r, [fileId]: (r[fileId] ?? 0) + 1 }))
  }

  useEffect(() => {
    if (!openMenu) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-photomenu]')) setOpenMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openMenu])

  const load = useCallback(async () => {
    setLoading(true)
    const [galleryRes, selectionsRes, groupsRes] = await Promise.all([
      fetch(`/studio/api/client/gallery/${token}/events/${projectId}`),
      fetch(`/studio/api/client/selections?projectId=${projectId}`),
      // Non-fatal — a studio without AI Sorting run (or no groups saved yet)
      // just means no group strip renders, never an error state.
      fetch(`/studio/api/client/gallery/${token}/events/${projectId}/faces/groups`).catch(() => null),
    ])
    if (groupsRes) {
      groupsRes.json().then(d => { if (d.success) setFaceGroups(d.data) }).catch(() => {})
    }

    if (galleryRes.status === 401 || galleryRes.status === 403) {
      router.replace(`/studio/otp?t=${token}`)
      return
    }
    if (galleryRes.status === 410) {
      setError('This gallery link has expired. Please contact your photographer.')
      setLoading(false)
      return
    }

    const galleryData = await galleryRes.json()
    if (!galleryData.success) {
      setError('Could not load this event gallery. Please try again.')
      setLoading(false)
      return
    }

    const selectionsData = await selectionsRes.json()
    const selMap = new Map<string, Selection>()
    if (selectionsData.success) {
      for (const s of selectionsData.data as Selection[]) selMap.set(s.fileId, s)
    }

    const merged: GalleryFile[] = galleryData.data.files.map((f: MediaFile) => {
      const sel = selMap.get(f.fileId)
      return {
        ...f,
        isSelected:      sel?.isSelected      ?? false,
        editingRequired: sel?.editingRequired  ?? false,
        comment:         sel?.comment          ?? '',
      }
    })

    setProject(galleryData.data.project)
    setBaseline(merged)

    // Apply any in-progress local draft on top of the submitted baseline — a
    // purely client-side safety net so an accidental refresh before Submit
    // doesn't lose unsaved picks. Never touches the backend.
    let withDraft = merged
    try {
      const saved = localStorage.getItem(draftKey)
      if (saved) {
        const draft = JSON.parse(saved) as Record<string, { isSelected: boolean; editingRequired: boolean; comment: string }>
        withDraft = merged.map((f) => draft[f.fileId] ? { ...f, ...draft[f.fileId] } : f)
      }
    } catch { /* corrupt/unavailable localStorage — ignore, fall back to baseline */ }

    setFiles(withDraft)
    setLoading(false)

    const sat = galleryData.data.project.selectionSubmittedAt ?? null
    if (sat) { setSubmittedAt(sat); setSubmitted(true) }
  }, [token, projectId, router, draftKey])

  useEffect(() => { load() }, [load])

  // Pure local state — no network call. The whole draft is sent once, on Submit/Resubmit.
  const toggleSelect = (fileId: string) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.fileId !== fileId) return f
        return f.isSelected
          ? { ...f, isSelected: false, editingRequired: false, comment: '' }
          : { ...f, isSelected: true }
      })
    )
  }

  const setEditing = (fileId: string, value: boolean) => {
    setFiles((prev) =>
      prev.map((f) => f.fileId !== fileId ? f : { ...f, editingRequired: value, ...(value ? {} : { comment: '' }) })
    )
  }

  const setComment = (fileId: string, comment: string) => {
    setFiles((prev) => prev.map((f) => f.fileId !== fileId ? f : { ...f, comment }))
  }

  const toggleFilter = (filter: 'loved' | 'edit') => {
    setViewFilter(prev => prev === filter ? 'all' : filter)
    if (viewMode === 'lightbox') setViewMode('grid')
  }

  // Drag the zoom bar's dot up/down the track to set zoom directly, instead
  // of only stepping one column at a time via +/- — same handler as the
  // admin dashboard's floating zoom bar. Handles mouse and touch alike.
  const handleZoomTrackDrag = (e: React.MouseEvent | React.TouchEvent) => {
    const track = zoomTrackRef.current
    if (!track) return
    const getClientY = (ev: MouseEvent | TouchEvent) => 'touches' in ev ? ev.touches[0].clientY : ev.clientY
    const updateFromY = (clientY: number) => {
      const rect = track.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
      setZoomLevel(Math.round(2 + ratio * 8))
    }
    updateFromY('touches' in e ? e.touches[0].clientY : e.clientY)
    const onMove = (ev: MouseEvent | TouchEvent) => { updateFromY(getClientY(ev)); ev.preventDefault() }
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

  const openLightbox = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setLightboxIdx(idx)
    setViewMode('lightbox')
  }

  // Hidden-anchor download — same pattern used by the guest gallery.
  const triggerDownload = (fileId: string) => {
    const a = document.createElement('a')
    a.href = `/studio/api/client/gallery/${token}/download/${fileId}`
    a.download = ''
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    const res = await fetch('/studio/api/client/selections/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        selections: files.map((f) => ({
          fileId: f.fileId,
          isSelected: f.isSelected,
          editingRequired: f.editingRequired,
          comment: f.comment,
        })),
      }),
    }).then((r) => r.json())
    setSubmitting(false)
    setShowSubmit(false)
    if (res.success) {
      setSubmitted(true)
      setSubmittedAt(res.data.submittedAt)
      setShowSuccessModal(true)
      // The submitted draft becomes the new baseline — bar hides again until
      // the next real change, and the local safety-net draft is no longer needed.
      setBaseline(files)
      try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
    } else {
      alert(res.message ?? 'Could not submit selections. Please try again.')
    }
  }

  const RESUBMIT_WINDOW_MS = 12 * 60 * 60 * 1000
  useEffect(() => {
    if (!submittedAt) return
    const deadline = new Date(new Date(submittedAt).getTime() + RESUBMIT_WINDOW_MS)
    const tick = () => {
      const diff = deadline.getTime() - Date.now()
      if (diff <= 0) { setCountdown(''); return }
      const h = Math.floor(diff / 3_600_000)
      const m = Math.floor((diff % 3_600_000) / 60_000)
      setCountdown(`${h}h ${m}m`)
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [submittedAt])

  const canResubmit = submittedAt
    ? Date.now() - new Date(submittedAt).getTime() < RESUBMIT_WINDOW_MS
    : false

  // Discards only the *unsubmitted* draft changes, reverting to the last-submitted
  // baseline — never touches the backend, and never destroys anything already submitted.
  const clearAllSelections = () => {
    setFiles(baseline)
    try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
  }

  const openSelectionPreview = (startIdx = 0) => {
    setSelectionPreviewIdx(startIdx)
    setShowSelectionPreview(true)
  }

  const handleSwipeStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
  const handleSwipeEnd   = (e: React.TouchEvent, total: number) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) < 50) return
    if (diff > 0) setSelectionPreviewIdx(i => Math.min(total - 1, i + 1))
    else          setSelectionPreviewIdx(i => Math.max(0, i - 1))
  }

  const selectedCount   = files.filter((f) => f.isSelected).length
  const editCount       = files.filter((f) => f.editingRequired).length
  const selectedPhotos  = files.filter((f) => f.isSelected)

  // True only when the current draft actually differs from what was last submitted —
  // drives whether the floating bar shows at all post-submission.
  const isDirty = files.some((f) => {
    const b = baseline.find((x) => x.fileId === f.fileId)
    return (b?.isSelected ?? false) !== f.isSelected
      || (b?.editingRequired ?? false) !== f.editingRequired
      || (b?.comment ?? '') !== f.comment
  })

  // Persist the in-progress draft locally (no backend call) so it survives an
  // accidental refresh/tab-close before the client hits Submit.
  useEffect(() => {
    if (loading || !isDirty) return
    try {
      const draft: Record<string, { isSelected: boolean; editingRequired: boolean; comment: string }> = {}
      for (const f of files) draft[f.fileId] = { isSelected: f.isSelected, editingRequired: f.editingRequired, comment: f.comment }
      localStorage.setItem(draftKey, JSON.stringify(draft))
    } catch { /* storage unavailable/full — non-critical, just skip the safety net */ }
  }, [files, isDirty, loading, draftKey])

  useEffect(() => {
    if (!showSelectionPreview) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft')  setSelectionPreviewIdx(i => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setSelectionPreviewIdx(i => Math.min(selectedPhotos.length - 1, i + 1))
      if (e.key === 'Escape')     setShowSelectionPreview(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showSelectionPreview, selectedPhotos.length])

  const baseFiles: GalleryFile[] = viewFilter === 'all' ? files
    : viewFilter === 'loved' ? files.filter(f => f.isSelected)
    : files.filter(f => f.editingRequired)

  const groupFiltered: GalleryFile[] = faceGroupFilter
    ? baseFiles.filter(f => faceGroupFilter.fileIds.has(f.fileId))
    : baseFiles

  const displayFiles: GalleryFile[] = selfieFiles
    ? groupFiltered.filter(f => selfieFiles.some(sf => sf.fileId === f.fileId))
    : groupFiltered

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <div className="text-4xl">🔗</div>
        <div className="text-text-primary font-semibold">{error}</div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-bg pb-28">

      <InAppBrowserGuard />

      {/* ── Sticky header ───────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-bg/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {/* Back to gallery */}
            <button
              onClick={() => router.push(`/studio/gallery/${token}`)}
              className="flex items-center gap-1 text-xs text-muted hover:text-accent transition-colors flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              My Gallery
            </button>
            <div className="w-px h-4 bg-border flex-shrink-0" />
            <div className="min-w-0">
              <div className="font-bold text-text-primary text-sm truncate">
                {project ? fmtEventType(project.eventType) : ''}
              </div>
              <div className="text-xs text-muted truncate">
                {project && fmtDate(project.eventDate)} · {files.length} photos
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Find My Photos */}
            <button
              onClick={() => setShowSelfie(true)}
              className="flex items-center gap-1.5 text-xs font-semibold border border-accent/40 text-accent bg-accent/10 rounded-full px-3 py-1.5 hover:bg-accent/20 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Find My Photos
            </button>
            {editCount > 0 && (
              <button
                onClick={() => toggleFilter('edit')}
                className={`text-xs font-semibold border rounded-full px-2.5 py-1 transition-colors
                  ${viewFilter === 'edit'
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'text-orange-400 bg-orange-400/10 border-orange-400/20 hover:bg-orange-400/20'}`}
              >
                ✏️ {editCount}
              </button>
            )}
            <button
              onClick={() => toggleFilter('loved')}
              disabled={selectedCount === 0}
              className={`flex flex-col items-end transition-colors disabled:opacity-40 disabled:cursor-default
                ${viewFilter === 'loved' ? 'opacity-100' : ''}`}
            >
              <span className={`flex items-center gap-1.5 text-sm font-semibold transition-colors
                ${viewFilter === 'loved' ? 'text-rose-400' : 'text-rose-600'}`}>
                <HeartIcon filled className={`w-4 h-4 transition-transform ${viewFilter === 'loved' ? 'scale-125' : ''}`} />
                {selectedCount}
              </span>
              {project?.selectionMin !== undefined && project?.selectionMax !== undefined && project.selectionMax > 0 && (
                <span className="text-[10px] text-muted">
                  Required: {project.selectionMin}–{project.selectionMax}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Selfie search modal ─────────────────────────────── */}
      {showSelfie && (
        <SelfieSearchModal
          token={token}
          onClose={() => setShowSelfie(false)}
          onResults={photos => { setSelfieFiles(photos); setShowSelfie(false) }}
        />
      )}

      {/* ── Submitted banner ─────────────────────────────────── */}
      {submitted && (
        <div className="max-w-6xl mx-auto px-4 pt-3 pb-1">
          <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold border
            ${canResubmit
              ? 'bg-green-500/10 border-green-500/20 text-green-500'
              : 'bg-border/50 border-border text-muted'}`}
          >
            <span>{canResubmit ? '✅' : '🔒'}</span>
            <span className="flex-1">
              {canResubmit
                ? `Selection submitted · You can resubmit within ${countdown || '…'}`
                : 'Selection submitted · Resubmit window closed'}
            </span>
            {canResubmit && (
              <button
                onClick={() => setShowSuccessModal(true)}
                className="opacity-60 hover:opacity-100 transition-opacity underline underline-offset-2"
              >
                Details
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Selfie match banner ─────────────────────────────── */}
      {selfieFiles && (
        <div className="max-w-6xl mx-auto px-4 pt-3 pb-1">
          <div className="flex items-center gap-2 px-3 py-2 bg-accent/10 rounded-xl text-xs text-accent font-semibold">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Showing {displayFiles.length} photo{displayFiles.length !== 1 ? 's' : ''} with you</span>
            <button onClick={() => setSelfieFiles(null)} className="ml-auto opacity-60 hover:opacity-100">
              Show all ×
            </button>
          </div>
        </div>
      )}

      {/* ── Face groups strip — same stacked-photo cards as the studio
          admin's AI Face tab. Hidden once drilled into a specific group. ── */}
      {faceGroups && faceGroups.length > 0 && !faceGroupFilter && (
        <div className="max-w-6xl mx-auto px-4 pt-3 pb-1">
          <div className="flex items-start gap-4 overflow-x-auto pb-2">
            {faceGroups.map(group => {
              const groupPhotos = group.photoIds
                .map(id => files.find(f => f.fileId === id))
                .filter((f): f is GalleryFile => !!f)
              const stack = pickStableRandom(groupPhotos, group.faceId, 4)
              return (
                <div key={group.faceId} className="relative flex-shrink-0 group/gc">
                  <button
                    onClick={() => setFaceGroupFilter({ faceId: group.faceId, label: group.label, fileIds: new Set(group.photoIds) })}
                    className="relative w-28 h-24 flex-shrink-0"
                  >
                    {stack.length === 0 ? (
                      <div className="absolute inset-0 w-20 h-20 mx-auto rounded-xl border-2 border-dashed border-border flex items-center justify-center text-[10px] text-muted text-center px-1">
                        Loading…
                      </div>
                    ) : stack.map((f, i) => (
                      <div
                        key={f.fileId}
                        className="absolute top-0 left-1/2 w-20 h-20 rounded-xl overflow-hidden border-2 border-card shadow-[0_8px_20px_-6px_rgba(0,0,0,0.45)] transition-transform group-hover/gc:-translate-y-1.5"
                        style={{
                          transform: `translateX(-50%) rotate(${(i - (stack.length - 1) / 2) * 12}deg) translateX(${(i - (stack.length - 1) / 2) * 20}px)`,
                          zIndex: i,
                        }}
                      >
                        {f.r2PreviewUrl
                          ? <img src={f.r2PreviewUrl} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full bg-border/40" />}
                      </div>
                    ))}
                    {group.photoCount > stack.length && (
                      <span className="absolute -top-1.5 -right-1 z-10 w-5 h-5 flex items-center justify-center rounded-full bg-accent text-white text-[9px] font-bold shadow">
                        +{group.photoCount - stack.length}
                      </span>
                    )}
                  </button>
                  <div className="mt-1 text-center">
                    {group.label && <div className="text-[11px] font-bold text-text-primary truncate px-1">{group.label}</div>}
                    <div className="text-[10px] font-semibold text-muted">{group.photoCount} photo{group.photoCount !== 1 ? 's' : ''}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Back to groups ───────────────────────────────────── */}
      {faceGroupFilter && (
        <div className="max-w-6xl mx-auto px-4 pt-3 pb-1">
          <button onClick={() => setFaceGroupFilter(null)}
            className="flex items-center gap-1.5 text-xs font-bold text-accent hover:text-accent/80 transition-colors">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to groups
            <span className="text-muted font-normal">— {faceGroupFilter.label ?? 'Group'} · {displayFiles.length} photo{displayFiles.length !== 1 ? 's' : ''}</span>
          </button>
        </div>
      )}

      {/* ── Grid toolbar ────────────────────────────────────── */}
      {files.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 pt-2 pb-1">
          {viewFilter !== 'all' ? (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold
              ${viewFilter === 'loved' ? 'bg-rose-500/10 text-rose-500' : 'bg-orange-500/10 text-orange-500'}`}>
              {viewFilter === 'loved'
                ? <><HeartIcon filled className="w-3.5 h-3.5 flex-shrink-0" /> Loved photos</>
                : <>✏️ Needs editing</>}
              <span className="font-normal text-current/70">— {displayFiles.length}</span>
              <button onClick={() => setViewFilter('all')} className="ml-auto opacity-60 hover:opacity-100 transition-opacity">
                All ×
              </button>
            </div>
          ) : (
            <span className="text-xs text-muted">{files.length} photos</span>
          )}
        </div>
      )}

      {/* ── Floating zoom bar — same drag-track control the studio admin's
          own gallery grid uses, works equally well as a touch target on
          mobile (most clients browse from a phone) and with a mouse. ── */}
      {files.length > 0 && (
        <div className="fixed right-3 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-1 bg-card border border-border/60 rounded-full py-1.5 px-1 shadow-lg">
          <button onClick={() => setZoomLevel(v => Math.max(2, v - 1))} title="Fewer columns (zoom in)"
            className="w-6 h-6 flex-shrink-0 flex items-center justify-center text-muted hover:text-accent transition-colors text-sm font-bold leading-none">
            +
          </button>
          <div ref={zoomTrackRef} onMouseDown={handleZoomTrackDrag} onTouchStart={handleZoomTrackDrag}
            className="relative w-1.5 h-28 flex-shrink-0 bg-border/50 rounded-full cursor-pointer touch-none">
            <span
              className="absolute left-1/2 w-3.5 h-3.5 rounded-full bg-accent shadow-sm cursor-grab active:cursor-grabbing"
              style={{ top: `${((zoomLevel - 2) / 8) * 100}%`, transform: 'translate(-50%, -50%)' }}
            />
          </div>
          <button onClick={() => setZoomLevel(v => Math.min(10, v + 1))} title="More columns (zoom out)"
            className="w-6 h-6 flex-shrink-0 flex items-center justify-center text-muted hover:text-accent transition-colors text-sm font-bold leading-none">
            −
          </button>
        </div>
      )}

      {/* ── Photo grid ──────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 pt-2">
        {files.length === 0 ? (
          <div className="text-center py-20 text-muted">No photos are ready yet. Check back soon!</div>
        ) : displayFiles.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <div className="text-4xl">{viewFilter === 'loved' ? '❤️' : '✏️'}</div>
            <p className="text-muted text-sm">
              {viewFilter === 'loved' ? 'No photos selected yet — tap any photo to love it.' : 'No photos marked for editing yet.'}
            </p>
            <button onClick={() => setViewFilter('all')} className="text-xs text-accent hover:underline">Show all photos</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${zoomLevel}, minmax(0, 1fr))`, gap: '8px' }}>
            {displayFiles.map((f, idx) => (
              <div key={f.fileId} className={`relative ${openMenu === f.fileId ? 'z-20' : 'z-0'}`}>
                <div
                  className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer select-none transition-all duration-150
                    ${f.isSelected
                      ? 'ring-2 ring-rose-600 ring-offset-2 ring-offset-bg shadow-md shadow-rose-600/20'
                      : 'ring-1 ring-border hover:ring-2 hover:ring-border'}`}
                  onClick={() => toggleSelect(f.fileId)}
                  onDoubleClick={(e) => openLightbox(idx, e)}
                >
                  {f.r2PreviewUrl ? (
                    <>
                      <img
                        src={imgRetry[f.fileId] ? `${f.r2PreviewUrl}${f.r2PreviewUrl.includes('?') ? '&' : '?'}r=${imgRetry[f.fileId]}` : f.r2PreviewUrl}
                        alt={f.originalFilename}
                        className="w-full h-full object-cover"
                        draggable={false}
                        onLoad={() => setImgStatus((s) => ({ ...s, [f.fileId]: 'loaded' }))}
                        onError={() => setImgStatus((s) => ({ ...s, [f.fileId]: 'error' }))}
                      />
                      {imgStatus[f.fileId] === undefined && (
                        <div className="absolute inset-0 bg-card flex items-center justify-center pointer-events-none">
                          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                      {imgStatus[f.fileId] === 'error' && (
                        <div className="absolute inset-0 bg-card/95 flex flex-col items-center justify-center gap-1.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); retryImage(f.fileId) }}
                            title="Retry loading photo"
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          </button>
                          <span className="text-[9px] text-muted">Tap to retry</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full bg-card flex items-center justify-center text-muted text-xs p-2 text-center">
                      {f.originalFilename}
                    </div>
                  )}
                  {f.isSelected && <div className="absolute inset-0 bg-black/15 pointer-events-none" />}
                  <div className={`absolute inset-0 flex items-center justify-center transition-all duration-200 pointer-events-none ${f.isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}>
                    <HeartIcon filled className="w-14 h-14 text-rose-600/60 drop-shadow-lg" />
                  </div>
                  {f.editedS3Key ? (
                    <div className="absolute top-1.5 left-1.5 bg-success text-bg text-[9px] font-extrabold px-1.5 py-0.5 rounded-full pointer-events-none uppercase tracking-wide">Edited</div>
                  ) : f.editingRequired && (
                    <div className="absolute top-1.5 left-1.5 bg-yellow-400 text-bg text-[9px] font-extrabold px-1.5 py-0.5 rounded-full pointer-events-none uppercase tracking-wide">Edits</div>
                  )}
                  <button
                    onClick={(e) => openLightbox(idx, e)}
                    className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white text-xs flex items-center justify-center hover:bg-black/70 transition-opacity opacity-0 hover:opacity-100"
                    title="View full size"
                  >⤢</button>
                </div>

                {f.isSelected && (
                  <button
                    data-photomenu
                    onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === f.fileId ? null : f.fileId) }}
                    className={`absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-full flex items-center justify-center transition-colors
                      ${openMenu === f.fileId ? 'bg-accent text-bg' : 'bg-black/50 text-white hover:bg-black/75'}`}
                    title="Photo options"
                  >
                    <DotsIcon />
                  </button>
                )}

                {openMenu === f.fileId && (
                  <div data-photomenu className="absolute top-9 right-0 z-30 w-56 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-border/20">
                      <span className="text-xs font-bold text-text-primary">Editing Required?</span>
                      <button onClick={() => setOpenMenu(null)} className="w-5 h-5 flex items-center justify-center rounded text-muted hover:text-text-primary hover:bg-border transition-colors">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="p-3 space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setEditing(f.fileId, false)}
                          className={`py-2 rounded-xl text-xs font-bold border transition-all ${!f.editingRequired ? 'bg-success/15 border-success/40 text-success shadow-sm' : 'border-border text-muted hover:bg-border/40'}`}>
                          ✓ No
                        </button>
                        <button onClick={() => setEditing(f.fileId, true)}
                          className={`py-2 rounded-xl text-xs font-bold border transition-all ${f.editingRequired ? 'bg-yellow-400/15 border-yellow-400/40 text-yellow-400 shadow-sm' : 'border-border text-muted hover:bg-border/40'}`}>
                          ✏️ Yes
                        </button>
                      </div>
                      <div className={`transition-all duration-200 overflow-hidden ${f.editingRequired ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
                        <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">What edits are needed?</label>
                        <textarea
                          value={f.comment}
                          onChange={(e) => setComment(f.fileId, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="e.g. Please brighten, remove blemish on left..."
                          rows={3}
                          className="w-full bg-bg border border-border rounded-xl px-2.5 py-2 text-xs text-text-primary placeholder:text-muted/50 focus:outline-none focus:border-accent/60 resize-none transition-colors"
                        />
                        <p className="text-[9px] text-muted mt-1">Auto-saved as you type</p>
                      </div>
                      {!f.editingRequired && (
                        <p className="text-[10px] text-muted leading-relaxed">
                          Tap <span className="font-semibold text-yellow-400">Yes</span> if this photo needs retouching, colour correction, or any other edit.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Lightbox — download + love/select, no star/info (client role) ── */}
      {viewMode === 'lightbox' && displayFiles.length > 0 && (
        <PhotoLightbox
          photos={displayFiles.map((f): LightboxPhoto => ({ fileId: f.fileId, previewUrl: f.r2PreviewUrl ?? '', filename: f.originalFilename }))}
          index={lightboxIdx}
          onIndexChange={setLightboxIdx}
          onClose={() => setViewMode('grid')}
          role="client"
          isSelected={(p) => displayFiles.find(f => f.fileId === p.fileId)?.isSelected ?? false}
          onToggleSelect={(p) => toggleSelect(p.fileId)}
          onDownload={(p) => triggerDownload(p.fileId)}
        />
      )}

      {/* ── Floating selection bar — only when the draft actually differs from
          what was last submitted, so it doesn't linger with nothing new to save ── */}
      {isDirty && selectedCount > 0 && (
        <div className="fixed bottom-5 inset-x-4 z-30 flex justify-center" onClick={e => e.stopPropagation()}>
          <div className="bg-card/80 backdrop-blur-xl border border-border/70 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            {project?.selectionMax !== undefined && project.selectionMax > 0 && (() => {
              const min = project.selectionMin ?? 0
              const max = project.selectionMax
              const pct = Math.min(100, (selectedCount / max) * 100)
              const inRange = selectedCount >= min && selectedCount <= max
              const under   = selectedCount < min
              return (
                <div className="px-4 pt-2.5 pb-1 space-y-1">
                  <div className="flex justify-between text-[10px] text-muted">
                    <span>{under ? `${min - selectedCount} more needed` : inRange ? `✓ In range` : `${selectedCount - max} over max`}</span>
                    <span className="font-semibold">{selectedCount}/{min}–{max}</span>
                  </div>
                  <div className="h-1 bg-border rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-300 ${inRange ? 'bg-success' : under ? 'bg-accent' : 'bg-yellow-400'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })()}
            <div className="flex items-center gap-1 px-2 py-2.5">
              <button onClick={clearAllSelections} className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl hover:bg-border/60 transition-colors text-muted hover:text-text-primary" aria-label="Clear selection">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="flex items-center gap-1 font-bold text-sm text-text-primary">
                  <HeartIcon filled className="w-4 h-4 text-rose-500" />
                  {selectedCount}
                </span>
                {editCount > 0 && (
                  <span className="text-[11px] font-semibold text-orange-400 bg-orange-400/10 border border-orange-400/20 rounded-full px-2 py-0.5 flex-shrink-0">✏️ {editCount}</span>
                )}
              </div>
              <button onClick={() => openSelectionPreview(0)} className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl hover:bg-border/60 transition-colors text-muted hover:text-text-primary" aria-label="Preview selection">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <div className="w-px h-6 bg-border/60 flex-shrink-0" />
              {!submitted ? (
                <button onClick={() => setShowSubmit(true)} className="bg-accent text-bg font-bold px-4 py-2 rounded-xl hover:bg-accent/90 active:scale-[0.97] transition-all text-sm whitespace-nowrap flex-shrink-0">Submit →</button>
              ) : canResubmit ? (
                <button onClick={() => setShowSubmit(true)} className="bg-accent text-bg font-bold px-4 py-2 rounded-xl hover:bg-accent/90 active:scale-[0.97] transition-all text-sm whitespace-nowrap flex-shrink-0">Resubmit ↺</button>
              ) : (
                <div className="text-xs text-muted font-semibold px-3 py-2 rounded-xl bg-border/40 whitespace-nowrap flex-shrink-0">🔒 Locked</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Success modal ───────────────────────────────────── */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center px-4">
          <div className="bg-card border border-border rounded-3xl p-7 w-full max-w-sm text-center space-y-5">
            <div className="text-6xl">✅</div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-text-primary">Selection Submitted!</h2>
              <p className="text-sm text-muted leading-relaxed">
                Your photographer received your selection of{' '}
                <strong className="text-text-primary">{selectedCount} photo{selectedCount !== 1 ? 's' : ''}</strong>.
                {editCount > 0 && ` ${editCount} marked for editing.`}
              </p>
            </div>
            {canResubmit && countdown && (
              <div className="bg-accent/10 border border-accent/20 rounded-2xl px-4 py-3 space-y-0.5">
                <p className="text-xs text-muted">You can edit &amp; resubmit within</p>
                <p className="text-accent font-bold text-xl">{countdown}</p>
              </div>
            )}
            <div className="space-y-2">
              <button onClick={() => setShowSuccessModal(false)} className="w-full bg-accent text-bg font-bold py-3.5 rounded-2xl hover:bg-accent/90 active:scale-[0.98] transition-all">
                Close — Browse Gallery
              </button>
              <button onClick={() => { setShowSuccessModal(false); router.push(`/studio/gallery/${token}`) }} className="w-full text-sm text-muted hover:text-text-primary transition-colors py-2">
                ← Back to My Gallery
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Submit confirmation modal ───────────────────────── */}
      {showSubmit && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center px-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-bold text-text-primary">Submit Selections?</h2>
            <p className="text-sm text-muted leading-relaxed">
              You&apos;ve selected <strong className="text-text-primary">{selectedCount} photos</strong>.
              {editCount > 0 && ` ${editCount} marked for editing.`}
              {' '}{submitted
                ? `This will replace your previous submission. You have ${countdown || 'limited time'} left to make further changes.`
                : 'After submitting, you can update your selection within 12 hours.'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowSubmit(false)} disabled={submitting} className="flex-1 border border-border text-text-primary text-sm font-semibold py-3 rounded-xl hover:bg-border transition-colors">Go back</button>
              <button onClick={handleSubmit} disabled={submitting} className="flex-1 bg-accent text-bg text-sm font-bold py-3 rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-50">
                {submitting ? 'Submitting…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Swipeable selection preview modal ──────────────── */}
      {showSelectionPreview && selectedPhotos.length > 0 && (
        <div className="fixed inset-0 z-[70] bg-black/95 flex flex-col" onClick={() => setShowSelectionPreview(false)}>
          <div className="flex items-center justify-between px-4 pt-safe pt-4 pb-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <div className="text-white/70 text-sm font-semibold">{selectionPreviewIdx + 1} / {selectedPhotos.length}</div>
            <div className="text-white font-bold text-base">Selected Photos</div>
            <button onClick={() => setShowSelectionPreview(false)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden relative" onTouchStart={handleSwipeStart} onTouchEnd={e => handleSwipeEnd(e, selectedPhotos.length)} onClick={e => e.stopPropagation()}>
            <img key={selectedPhotos[selectionPreviewIdx]?.fileId} src={selectedPhotos[selectionPreviewIdx]?.r2PreviewUrl ?? ''} alt="" className="max-h-full max-w-full object-contain select-none" draggable={false} />
            {selectionPreviewIdx > 0 && (
              <button onClick={() => setSelectionPreviewIdx(i => i - 1)} className="absolute left-3 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/75 active:scale-95 transition-all border border-white/20" aria-label="Previous photo">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              </button>
            )}
            {selectionPreviewIdx < selectedPhotos.length - 1 && (
              <button onClick={() => setSelectionPreviewIdx(i => i + 1)} className="absolute right-3 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/75 active:scale-95 transition-all border border-white/20" aria-label="Next photo">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </button>
            )}
          </div>
          {selectedPhotos[selectionPreviewIdx]?.editedS3Key ? (
            <div className="absolute top-20 left-4 bg-success/90 text-white text-xs font-bold px-2.5 py-1 rounded-full pointer-events-none">✓ Edited</div>
          ) : selectedPhotos[selectionPreviewIdx]?.editingRequired && (
            <div className="absolute top-20 left-4 bg-orange-500/90 text-white text-xs font-bold px-2.5 py-1 rounded-full pointer-events-none">✏️ Edit requested</div>
          )}
          <div className="flex-shrink-0 flex gap-2 overflow-x-auto px-4 pb-6 pt-3 snap-x snap-mandatory scrollbar-hide" onClick={e => e.stopPropagation()}>
            {selectedPhotos.map((photo, idx) => (
              <button key={photo.fileId} onClick={() => setSelectionPreviewIdx(idx)}
                className={`relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden snap-start border-2 transition-all ${idx === selectionPreviewIdx ? 'border-accent scale-105' : 'border-white/20 opacity-60'}`}>
                <img src={photo.r2PreviewUrl ?? ''} alt="" className="w-full h-full object-cover" />
                {photo.editingRequired && <div className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-orange-500 rounded-full" />}
              </button>
            ))}
          </div>
          {selectedPhotos.length > 1 && (
            <div className="absolute bottom-[90px] inset-x-0 flex justify-center pointer-events-none">
              <span className="text-white/30 text-xs">← swipe to browse →</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Root page component ────────────────────────────────────────────────────────

function ClientGalleryInner() {
  const { token } = useParams<{ token: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const activeProjectId = searchParams.get('event')

  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [clientName, setClientName]   = useState('')
  const [studioName, setStudioName]   = useState('')
  const [events, setEvents]           = useState<EventOverview[]>([])
  const [totalLoved, setTotalLoved]   = useState(0)
  const [totalEdit, setTotalEdit]     = useState(0)
  const [totalSubmitted, setTotalSubmitted] = useState(0)

  const loadOverview = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/studio/api/client/gallery/${token}`)
    if (res.status === 401 || res.status === 403) {
      router.replace(`/studio/otp?t=${token}`)
      return
    }
    if (res.status === 410) {
      setError('This gallery link has expired. Please contact your photographer.')
      setLoading(false)
      return
    }
    const data = await res.json()
    if (!data.success) {
      setError('Could not load your gallery. Please try again.')
      setLoading(false)
      return
    }
    setClientName(data.data.clientName)
    setStudioName(data.data.studio?.name ?? '')
    setEvents(data.data.events)
    setTotalLoved(data.data.totalLoved)
    setTotalEdit(data.data.totalEdit)
    setTotalSubmitted(data.data.totalSubmitted)
    setLoading(false)
  }, [token, router])

  useEffect(() => {
    if (!activeProjectId) loadOverview()
  }, [activeProjectId, loadOverview])

  if (activeProjectId) {
    return <EventGalleryView token={token} projectId={activeProjectId} />
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <div className="text-4xl">🔗</div>
        <div className="text-text-primary font-semibold">{error}</div>
      </div>
    </div>
  )

  return (
    <GalleryOverview
      events={events}
      clientName={clientName}
      studioName={studioName}
      totalLoved={totalLoved}
      totalEdit={totalEdit}
      totalSubmitted={totalSubmitted}
      token={token}
    />
  )
}

export default function ClientGalleryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ClientGalleryInner />
    </Suspense>
  )
}
