'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { StudioProject, MediaFile, Selection } from '@/types/studio'

interface GalleryFile extends MediaFile {
  isSelected: boolean
  editingRequired: boolean
  comment: string
}

type ViewMode = 'grid' | 'lightbox'

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

export default function ClientGalleryPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()

  const [project, setProject]         = useState<StudioProject | null>(null)
  const [files, setFiles]             = useState<GalleryFile[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [viewMode, setViewMode]       = useState<ViewMode>('grid')
  const [lightboxIdx, setLightboxIdx] = useState(0)
  const [showSubmit, setShowSubmit]   = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [submitted, setSubmitted]     = useState(false)
  const [openMenu, setOpenMenu]       = useState<string | null>(null)
  const saveQueue                     = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Close 3-dot menu on outside click
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
    const [galleryRes, selectionsRes] = await Promise.all([
      fetch(`/studio/api/client/gallery/${token}`),
      fetch('/studio/api/client/selections'),
    ])

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
      setError('Could not load your gallery. Please try again.')
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
    setFiles(merged)
    setLoading(false)

    if (galleryData.data.project.status === 'SELECTION_RECEIVED' ||
        galleryData.data.project.status === 'COMPLETED') {
      setSubmitted(true)
    }
  }, [token, router])

  useEffect(() => { load() }, [load])

  const saveSelection = (fileId: string, patch: Partial<GalleryFile>) => {
    const existing = saveQueue.current.get(fileId)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(async () => {
      saveQueue.current.delete(fileId)
      setFiles((prev) => {
        const f = prev.find((x) => x.fileId === fileId)
        if (!f) return prev
        fetch('/studio/api/client/selections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileId,
            isSelected:      patch.isSelected      ?? f.isSelected,
            editingRequired: patch.editingRequired  ?? f.editingRequired,
            comment:         patch.comment          ?? f.comment,
          }),
        }).catch((e: unknown) => console.error('[save selection]', e))
        return prev
      })
    }, 600)
    saveQueue.current.set(fileId, timer)
  }

  const toggleSelect = (fileId: string) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.fileId !== fileId) return f
        const selecting = !f.isSelected
        // Deselecting — reset edit flags too so nothing lingers
        const next = selecting
          ? { ...f, isSelected: true }
          : { ...f, isSelected: false, editingRequired: false, comment: '' }
        saveSelection(fileId, { isSelected: next.isSelected, editingRequired: next.editingRequired, comment: next.comment })
        return next
      })
    )
  }

  const setEditing = (fileId: string, value: boolean) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.fileId !== fileId) return f
        const next = { ...f, editingRequired: value, ...(value ? {} : { comment: '' }) }
        saveSelection(fileId, { editingRequired: next.editingRequired, comment: next.comment })
        return next
      })
    )
  }

  const setComment = (fileId: string, comment: string) => {
    setFiles((prev) => prev.map((f) => f.fileId !== fileId ? f : { ...f, comment }))
    saveSelection(fileId, { comment })
  }

  const openLightbox = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setLightboxIdx(idx)
    setViewMode('lightbox')
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    const res = await fetch('/studio/api/client/selections/submit', { method: 'POST' }).then((r) => r.json())
    setSubmitting(false)
    setShowSubmit(false)
    if (res.success) {
      setSubmitted(true)
    } else {
      alert(res.message ?? 'Could not submit selections. Please try again.')
    }
  }

  const selectedCount  = files.filter((f) => f.isSelected).length
  const editCount      = files.filter((f) => f.editingRequired).length

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

  if (submitted) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-5 max-w-sm">
        <div className="text-6xl">✅</div>
        <h1 className="text-2xl font-bold text-text-primary">Selections Submitted!</h1>
        <p className="text-muted text-sm leading-relaxed">
          We&apos;ve received your photo selections. Your photographer will review them and get back to you soon.
        </p>
        <div className="bg-card border border-border rounded-xl p-4 text-sm text-left space-y-1">
          <div className="text-muted">Photos selected</div>
          <div className="text-2xl font-bold text-accent">{selectedCount || '—'}</div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-bg pb-28">

      {/* ── Sticky header ───────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-bg/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <div className="font-bold text-text-primary text-sm">{project?.clientName}</div>
            <div className="text-xs text-muted">
              {project && new Date(project.eventDate).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'long', year: 'numeric',
              })} · {files.length} photos
            </div>
          </div>
          <div className="flex items-center gap-3">
            {editCount > 0 && (
              <span className="text-xs font-semibold text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-full px-2.5 py-1">
                {editCount} edits
              </span>
            )}
            <span className="flex items-center gap-1.5 text-sm font-semibold text-rose-600">
              <HeartIcon filled className="w-4 h-4" />
              {selectedCount}
            </span>
          </div>
        </div>
      </div>

      {/* ── How-to guide ────────────────────────────────────── */}
      {files.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 pt-4 pb-2">
          <div className="bg-card border border-border rounded-2xl px-4 py-4">
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-3">How to use your gallery</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col items-center gap-1.5 text-center">
                <div className="w-9 h-9 rounded-xl bg-rose-600/10 border border-rose-600/20 flex items-center justify-center">
                  <HeartIcon filled className="w-5 h-5 text-rose-600" />
                </div>
                <p className="text-[11px] font-semibold text-text-primary">Tap to select</p>
                <p className="text-[10px] text-muted leading-tight">Tap any photo to add it to your selection</p>
              </div>
              <div className="flex flex-col items-center gap-1.5 text-center">
                <div className="w-9 h-9 rounded-xl bg-border/60 border border-border flex items-center justify-center">
                  <DotsIcon />
                </div>
                <p className="text-[11px] font-semibold text-text-primary">Request edits</p>
                <p className="text-[10px] text-muted leading-tight">Tap ··· on any photo to ask for retouching</p>
              </div>
              <div className="flex flex-col items-center gap-1.5 text-center">
                <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-[11px] font-semibold text-text-primary">Submit when done</p>
                <p className="text-[10px] text-muted leading-tight">Hit Submit at the bottom when you&apos;re happy</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Photo grid ──────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 pt-4">
        {files.length === 0 ? (
          <div className="text-center py-20 text-muted">No photos are ready yet. Check back soon!</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {files.map((f, idx) => (
              // Outer wrapper: no overflow-hidden so 3-dot popover can bleed out
              <div
                key={f.fileId}
                className={`relative ${openMenu === f.fileId ? 'z-20' : 'z-0'}`}
              >
                {/* Inner card: overflow-hidden clips image to rounded corners */}
                <div
                  className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer select-none transition-all duration-150
                    ${f.isSelected
                      ? 'ring-2 ring-rose-600 ring-offset-2 ring-offset-bg shadow-md shadow-rose-600/20'
                      : 'ring-1 ring-border hover:ring-2 hover:ring-border'
                    }`}
                  onClick={() => toggleSelect(f.fileId)}
                >
                  {/* Photo */}
                  {f.r2PreviewUrl ? (
                    <img
                      src={f.r2PreviewUrl}
                      alt={f.originalFilename}
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full bg-card flex items-center justify-center text-muted text-xs p-2 text-center">
                      {f.originalFilename}
                    </div>
                  )}

                  {/* Subtle dark tint when selected */}
                  {f.isSelected && (
                    <div className="absolute inset-0 bg-black/15 pointer-events-none" />
                  )}

                  {/* Heart — pops in on select, centered */}
                  <div className={`absolute inset-0 flex items-center justify-center transition-all duration-200 pointer-events-none ${
                    f.isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
                  }`}>
                    <HeartIcon filled className="w-14 h-14 text-rose-600/60 drop-shadow-lg" />
                  </div>

                  {/* Edit-required badge — top-left, visible when marked */}
                  {f.editingRequired && (
                    <div className="absolute top-1.5 left-1.5 bg-yellow-400 text-bg text-[9px] font-extrabold px-1.5 py-0.5 rounded-full pointer-events-none uppercase tracking-wide">
                      Edits
                    </div>
                  )}

                  {/* Expand to lightbox — bottom-right */}
                  <button
                    onClick={(e) => openLightbox(idx, e)}
                    className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white text-xs flex items-center justify-center hover:bg-black/70 transition-opacity opacity-0 hover:opacity-100"
                    title="View full size"
                  >
                    ⤢
                  </button>
                </div>

                {/* ── 3-dot button — only when selected ── */}
                {f.isSelected && (
                  <button
                    data-photomenu
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpenMenu(openMenu === f.fileId ? null : f.fileId)
                    }}
                    className={`absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-full flex items-center justify-center transition-colors
                      ${openMenu === f.fileId
                        ? 'bg-accent text-bg'
                        : 'bg-black/50 text-white hover:bg-black/75'
                      }`}
                    title="Photo options"
                  >
                    <DotsIcon />
                  </button>
                )}

                {/* ── Popover ── */}
                {openMenu === f.fileId && (
                  <div
                    data-photomenu
                    className="absolute top-9 right-0 z-30 w-56 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Popover header */}
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-border/20">
                      <span className="text-xs font-bold text-text-primary">Editing Required?</span>
                      <button
                        onClick={() => setOpenMenu(null)}
                        className="w-5 h-5 flex items-center justify-center rounded text-muted hover:text-text-primary hover:bg-border transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    <div className="p-3 space-y-3">
                      {/* Yes / No toggle */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setEditing(f.fileId, false)}
                          className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                            !f.editingRequired
                              ? 'bg-success/15 border-success/40 text-success shadow-sm'
                              : 'border-border text-muted hover:bg-border/40'
                          }`}
                        >
                          ✓ No
                        </button>
                        <button
                          onClick={() => setEditing(f.fileId, true)}
                          className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                            f.editingRequired
                              ? 'bg-yellow-400/15 border-yellow-400/40 text-yellow-400 shadow-sm'
                              : 'border-border text-muted hover:bg-border/40'
                          }`}
                        >
                          ✏️ Yes
                        </button>
                      </div>

                      {/* Comment field — only visible when editing required */}
                      <div className={`transition-all duration-200 overflow-hidden ${f.editingRequired ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
                        <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">
                          What edits are needed?
                        </label>
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

                      {/* Hint when No is selected */}
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

      {/* ── Lightbox ────────────────────────────────────────── */}
      {viewMode === 'lightbox' && (
        <div
          className="fixed inset-0 z-50 bg-black/92 flex items-center justify-center"
          onClick={() => setViewMode('grid')}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl w-10 h-10 flex items-center justify-center"
            onClick={() => setViewMode('grid')}
          >
            ✕
          </button>
          <button
            className="absolute left-3 text-white/70 hover:text-white text-3xl w-10 h-10 flex items-center justify-center disabled:opacity-20"
            disabled={lightboxIdx === 0}
            onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => i - 1) }}
          >
            ‹
          </button>
          <button
            className="absolute right-3 text-white/70 hover:text-white text-3xl w-10 h-10 flex items-center justify-center disabled:opacity-20"
            disabled={lightboxIdx === files.length - 1}
            onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => i + 1) }}
          >
            ›
          </button>
          <img
            src={files[lightboxIdx]?.r2PreviewUrl ?? ''}
            alt={files[lightboxIdx]?.originalFilename}
            className="max-h-screen max-w-full object-contain px-16"
            onClick={(e) => e.stopPropagation()}
            draggable={false}
          />
          <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-4">
            <span className="text-white/50 text-sm">{lightboxIdx + 1} / {files.length}</span>
          </div>
        </div>
      )}

      {/* ── Sticky bottom bar ───────────────────────────────── */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-bg/95 backdrop-blur border-t border-border px-4 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div>
            <div className="text-text-primary font-semibold text-sm flex items-center gap-1.5">
              {selectedCount === 0 ? (
                'Tap a photo to begin'
              ) : (
                <>
                  <HeartIcon filled className="w-4 h-4 text-rose-600" />
                  {selectedCount} photo{selectedCount !== 1 ? 's' : ''} selected
                </>
              )}
            </div>
            <div className="text-xs text-muted mt-0.5">
              {editCount > 0
                ? `${editCount} marked for editing · Tap ··· on a photo to edit`
                : selectedCount > 0
                  ? 'Tap ··· on any photo to request retouching'
                  : 'Tap any photo to add it to your selection'
              }
            </div>
          </div>
          <button
            onClick={() => setShowSubmit(true)}
            disabled={selectedCount === 0}
            className="bg-accent text-bg font-bold px-5 py-3 rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm whitespace-nowrap"
          >
            Submit →
          </button>
        </div>
      </div>

      {/* ── Submit confirmation modal ───────────────────────── */}
      {showSubmit && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center px-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-bold text-text-primary">Submit Selections?</h2>
            <p className="text-sm text-muted leading-relaxed">
              You&apos;ve selected <strong className="text-text-primary">{selectedCount} photos</strong>.
              {editCount > 0 && ` ${editCount} marked for editing.`}
              {' '}Once submitted, your selections cannot be changed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSubmit(false)}
                disabled={submitting}
                className="flex-1 border border-border text-text-primary text-sm font-semibold py-3 rounded-xl hover:bg-border transition-colors"
              >
                Go back
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 bg-accent text-bg text-sm font-bold py-3 rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
