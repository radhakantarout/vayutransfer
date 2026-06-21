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

export default function ClientGalleryPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()

  const [project, setProject]       = useState<StudioProject | null>(null)
  const [files, setFiles]           = useState<GalleryFile[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [viewMode, setViewMode]     = useState<ViewMode>('grid')
  const [lightboxIdx, setLightboxIdx] = useState(0)
  const [showSubmit, setShowSubmit] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const saveQueue                   = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

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
    // Cancel any pending save for this file
    const existing = saveQueue.current.get(fileId)
    if (existing) clearTimeout(existing)

    // Debounce 600ms (for comments)
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
        const next = { ...f, isSelected: !f.isSelected }
        saveSelection(fileId, { isSelected: next.isSelected })
        return next
      })
    )
  }

  const toggleEditing = (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setFiles((prev) =>
      prev.map((f) => {
        if (f.fileId !== fileId) return f
        const next = { ...f, editingRequired: !f.editingRequired }
        saveSelection(fileId, { editingRequired: next.editingRequired })
        return next
      })
    )
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

  const selectedCount = files.filter((f) => f.isSelected).length

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
      {/* Header */}
      <div className="sticky top-0 z-20 bg-bg/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <div className="font-bold text-text-primary text-sm">
              {project?.clientName}
            </div>
            <div className="text-xs text-muted">
              {project && new Date(project.eventDate).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'long', year: 'numeric',
              })} · {files.length} photos
            </div>
          </div>
          <div className="text-sm font-semibold text-accent">
            {selectedCount} selected
          </div>
        </div>
      </div>

      {/* Instruction banner */}
      {files.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 pt-4 pb-2">
          <div className="bg-accent/10 border border-accent/20 rounded-xl px-4 py-3 text-sm text-accent">
            Tap a photo to select it. Tap again to deselect. Use the ✏️ icon on selected photos to mark for editing.
          </div>
        </div>
      )}

      {/* Photo grid */}
      <div className="max-w-6xl mx-auto px-4 pt-4">
        {files.length === 0 ? (
          <div className="text-center py-20 text-muted">No photos are ready yet. Check back soon!</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {files.map((f, idx) => (
              <div
                key={f.fileId}
                className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer select-none
                  ${f.isSelected ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : 'ring-1 ring-border'}`}
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
                  <div className="w-full h-full bg-card flex items-center justify-center text-muted text-xs">
                    {f.originalFilename}
                  </div>
                )}

                {/* Selected overlay */}
                {f.isSelected && (
                  <div className="absolute inset-0 bg-accent/10 flex items-start justify-between p-1.5">
                    <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-bg text-xs font-bold">
                      ✓
                    </div>
                    <button
                      onClick={(e) => toggleEditing(f.fileId, e)}
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-colors
                        ${f.editingRequired ? 'bg-yellow-400 text-bg' : 'bg-black/40 text-white hover:bg-yellow-400 hover:text-bg'}`}
                      title="Mark for editing"
                    >
                      ✏️
                    </button>
                  </div>
                )}

                {/* Expand button (bottom-right, always visible on hover) */}
                <button
                  onClick={(e) => openLightbox(idx, e)}
                  className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 hover:bg-black/70 transition-opacity"
                  title="View full size"
                >
                  ⤢
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {viewMode === 'lightbox' && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setViewMode('grid')}
        >
          <button
            className="absolute top-4 right-4 text-white text-2xl w-10 h-10 flex items-center justify-center hover:text-accent"
            onClick={() => setViewMode('grid')}
          >
            ✕
          </button>
          <button
            className="absolute left-4 text-white text-2xl w-10 h-10 flex items-center justify-center hover:text-accent disabled:opacity-20"
            disabled={lightboxIdx === 0}
            onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => i - 1) }}
          >
            ‹
          </button>
          <button
            className="absolute right-4 text-white text-2xl w-10 h-10 flex items-center justify-center hover:text-accent disabled:opacity-20"
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
          <div className="absolute bottom-4 text-white text-sm text-center">
            {lightboxIdx + 1} / {files.length}
          </div>
        </div>
      )}

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-bg/95 backdrop-blur border-t border-border px-4 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div>
            <div className="text-text-primary font-semibold text-sm">
              {selectedCount === 0 ? 'No photos selected yet' : `${selectedCount} photo${selectedCount !== 1 ? 's' : ''} selected`}
            </div>
            {selectedCount > 0 && (
              <div className="text-xs text-muted mt-0.5">
                {files.filter((f) => f.editingRequired).length > 0
                  ? `${files.filter((f) => f.editingRequired).length} marked for editing`
                  : 'Tap ✏️ on a photo to mark it for editing'}
              </div>
            )}
          </div>
          <button
            onClick={() => setShowSubmit(true)}
            disabled={selectedCount === 0}
            className="bg-accent text-bg font-bold px-6 py-3 rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm"
          >
            Submit Selections
          </button>
        </div>
      </div>

      {/* Submit confirmation modal */}
      {showSubmit && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center px-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-bold text-text-primary">Submit Selections?</h2>
            <p className="text-sm text-muted leading-relaxed">
              You&apos;ve selected <strong className="text-text-primary">{selectedCount} photos</strong>.
              {files.filter((f) => f.editingRequired).length > 0 &&
                ` ${files.filter((f) => f.editingRequired).length} marked for editing.`}
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
