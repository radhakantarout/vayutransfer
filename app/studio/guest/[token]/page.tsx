'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import InAppBrowserGuard from '@/components/studio/InAppBrowserGuard'
import PhotoLightbox, { type LightboxPhoto } from '@/components/studio/PhotoLightbox'

interface GuestPhoto {
  fileId:      string
  previewUrl:  string
  filename:    string
  downloadUrl: string
}

interface ProjectInfo {
  eventType:  string
  clientName: string
  eventDate:  string
  studioName: string
  expiresAt:  string
}

type Stage = 'LOADING' | 'IDLE' | 'CAPTURING' | 'SEARCHING' | 'RESULTS' | 'NO_MATCH' | 'NO_FACE' | 'EXPIRED' | 'ERROR'

const EVENT_ICON: Record<string, string> = {
  WEDDING: '💒', MEHENDI: '🪔', RECEPTION: '🎊', ENGAGEMENT: '💍',
  PRE_WEDDING: '📸', BIRTHDAY: '🎂', CORPORATE: '🏢', SCHOOL: '🎒', OTHER: '📷',
}

export default function GuestPage() {
  const { token } = useParams<{ token: string }>()

  const [stage, setStage]           = useState<Stage>('LOADING')
  const [project, setProject]       = useState<ProjectInfo | null>(null)
  const [photos, setPhotos]         = useState<GuestPhoto[]>([])
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [shareSheetPhoto, setShareSheetPhoto] = useState<GuestPhoto | null>(null)
  const [shareToast, setShareToast] = useState(false)
  const [errorMsg, setErrorMsg]     = useState('')

  // Multi-select + rubber-band drag-select on the results grid — same pattern
  // used in the admin dashboard's EventSection.tsx.
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [dragRect, setDragRect]   = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const gridRef                   = useRef<HTMLDivElement>(null)
  const dragState                 = useRef<{ active: boolean; startX: number; startY: number; moved: boolean }>({
    active: false, startX: 0, startY: 0, moved: false,
  })
  const suppressNextTileClickRef  = useRef(false)

  const videoRef     = useRef<HTMLVideoElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const streamRef    = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  useEffect(() => {
    fetch(`/studio/api/guest/${token}`)
      .then(r => r.json())
      .then(res => {
        if (!res.success) {
          setStage(res.error === 'TOKEN_EXPIRED' ? 'EXPIRED' : 'ERROR')
          setErrorMsg('This QR code is no longer valid.')
          return
        }
        setProject(res.data)
        setStage('IDLE')
      })
      .catch(() => { setStage('ERROR'); setErrorMsg('Could not connect. Please try again.') })
  }, [token])

  // Rubber-band drag select
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragState.current.active || !gridRef.current) return
      const gr = gridRef.current.getBoundingClientRect()
      const cx = e.clientX - gr.left; const cy = e.clientY - gr.top
      const { startX, startY } = dragState.current
      if (Math.abs(cx - startX) > 4 || Math.abs(cy - startY) > 4) dragState.current.moved = true
      if (!dragState.current.moved) return
      setDragRect({ left: Math.min(startX, cx), top: Math.min(startY, cy), width: Math.abs(cx - startX), height: Math.abs(cy - startY) })
    }
    const onUp = (e: MouseEvent) => {
      if (!dragState.current.active) return
      const { startX, startY, moved } = dragState.current
      dragState.current.active = false; dragState.current.moved = false; setDragRect(null)
      if (!moved || !gridRef.current) return
      suppressNextTileClickRef.current = true
      const gr = gridRef.current.getBoundingClientRect()
      const ex = e.clientX - gr.left; const ey = e.clientY - gr.top
      const selL = Math.min(startX, ex) + gr.left; const selT = Math.min(startY, ey) + gr.top
      const selR = Math.max(startX, ex) + gr.left; const selB = Math.max(startY, ey) + gr.top
      const toSelect = new Set<string>()
      gridRef.current.querySelectorAll('[data-fileid]').forEach(el => {
        const r = el.getBoundingClientRect()
        if (r.left < selR && r.right > selL && r.top < selB && r.bottom > selT)
          toSelect.add((el as HTMLElement).dataset.fileid!)
      })
      if (toSelect.size > 0) {
        setSelected(prev => {
          const next = new Set(prev)
          toSelect.forEach(id => next.add(id))
          return next
        })
      }
    }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const handleGridMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('[data-no-drag]')) return
    const gr = gridRef.current!.getBoundingClientRect()
    dragState.current = { active: true, startX: e.clientX - gr.left, startY: e.clientY - gr.top, moved: false }
    e.preventDefault()
  }

  const toggleSelected = (fileId: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(fileId)) next.delete(fileId); else next.add(fileId)
      return next
    })
  }

  const handleTileClick = (fileId: string) => {
    if (suppressNextTileClickRef.current) { suppressNextTileClickRef.current = false; return }
    toggleSelected(fileId)
  }

  const clearSelection = () => setSelected(new Set())

  const startCamera = async () => {
    setStage('CAPTURING')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } },
      })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play() }
    } catch {
      setStage('IDLE')
      setErrorMsg('Camera access denied — please upload a photo instead.')
    }
  }

  const captureAndSearch = () => {
    if (!videoRef.current || !canvasRef.current) return
    const v = videoRef.current, c = canvasRef.current
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    stopCamera()
    c.toBlob(blob => { if (blob) sendSelfie(blob, 'image/jpeg') }, 'image/jpeg', 0.92)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setErrorMsg('Photo must be under 5 MB'); return }
    sendSelfie(file, file.type)
  }

  const sendSelfie = async (blob: Blob, mimeType: string) => {
    stopCamera()
    setStage('SEARCHING')
    setErrorMsg('')
    try {
      const form = new FormData()
      form.append('selfie', new File([blob], 'selfie.jpg', { type: mimeType }))
      const res = await fetch(`/studio/api/guest/${token}/search`, { method: 'POST', body: form }).then(r => r.json())

      if (!res.success) {
        if (res.error === 'TOKEN_EXPIRED') { setStage('EXPIRED'); return }
        if (res.error === 'NOT_INDEXED_YET') {
          setStage('ERROR')
          setErrorMsg("Photos haven't been set up for face search yet. Please contact your photographer.")
          return
        }
        setStage('ERROR'); setErrorMsg('Something went wrong. Please try again.'); return
      }

      const { error, photos: found } = res.data
      if (error === 'NO_FACE_DETECTED') { setStage('NO_FACE'); return }
      if (!found?.length) { setStage('NO_MATCH'); return }

      setPhotos(found)
      setStage('RESULTS')
    } catch {
      setStage('ERROR')
      setErrorMsg('Network error. Please check your connection and try again.')
    }
  }

  // Single hidden-anchor download — reused for both the lightbox's Download
  // icon and bulk "Download N", so there's exactly one download mechanism.
  const triggerDownload = (fileId: string) => {
    const a = document.createElement('a')
    a.href = `/studio/api/guest/${token}/download/${fileId}`
    a.download = ''
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  // Staggered so the browser doesn't silently block near-simultaneous
  // multi-file downloads (common with 3+ triggered in the same tick).
  const downloadSelected = () => {
    Array.from(selected).forEach((fileId, i) => setTimeout(() => triggerDownload(fileId), i * 150))
  }

  const shareToWhatsapp = (photo: GuestPhoto) => {
    const shareUrl = `${location.origin}/studio/api/guest/${token}/download/${photo.fileId}`
    window.open(`https://wa.me/?text=${encodeURIComponent(shareUrl)}`, '_blank')
    setShareSheetPhoto(null)
  }

  const shareMore = async (photo: GuestPhoto) => {
    setShareSheetPhoto(null)
    const shareUrl = `${location.origin}/studio/api/guest/${token}/download/${photo.fileId}`
    const shareData = { title: photo.filename, url: shareUrl }
    try {
      if (navigator.share && (navigator.canShare ? navigator.canShare(shareData) : true)) {
        await navigator.share(shareData)
      } else {
        await navigator.clipboard.writeText(shareUrl)
        setShareToast(true)
        setTimeout(() => setShareToast(false), 2500)
      }
    } catch {
      // User cancelled share — ignore
    }
  }

  const reset = () => {
    stopCamera(); setPhotos([]); setLightboxIdx(null); setSelected(new Set()); setErrorMsg(''); setStage('IDLE')
  }

  const lightboxPhotos: LightboxPhoto[] = photos.map(p => ({ fileId: p.fileId, previewUrl: p.previewUrl, filename: p.filename }))

  if (stage === 'EXPIRED') return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="text-center space-y-4 max-w-xs">
        <div className="text-5xl">⏰</div>
        <h1 className="text-lg font-bold text-text-primary">QR Code Expired</h1>
        <p className="text-sm text-muted">This QR code has expired. Please ask your photographer for a new one.</p>
      </div>
    </div>
  )

  if (stage === 'LOADING') return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const eventLabel = project ? (project.eventType ?? '').replace(/_/g, ' ') : ''
  const eventDate  = project
    ? new Date(project.eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  return (
    <div className="min-h-screen bg-bg">

      <InAppBrowserGuard />

      {/* Share toast */}
      {shareToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-text-primary text-bg text-sm font-semibold px-5 py-2.5 rounded-full shadow-lg">
          Link copied!
        </div>
      )}

      {/* Photo lightbox — download + share only, no star/info (guest role) */}
      {lightboxIdx !== null && lightboxPhotos.length > 0 && (
        <PhotoLightbox
          photos={lightboxPhotos}
          index={lightboxIdx}
          onIndexChange={setLightboxIdx}
          onClose={() => setLightboxIdx(null)}
          role="guest"
          onDownload={(p) => triggerDownload(p.fileId)}
          onShare={(p) => {
            const photo = photos.find(ph => ph.fileId === p.fileId)
            if (photo) setShareSheetPhoto(photo)
          }}
        />
      )}

      {/* Share sheet — WhatsApp + native share sheet ("More") */}
      {shareSheetPhoto && (
        <div
          className="fixed inset-0 z-[80] flex flex-col justify-end"
          onClick={() => setShareSheetPhoto(null)}
        >
          <div className="absolute inset-0 bg-black/70" />
          <div
            className="relative bg-card rounded-t-3xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-border rounded-full" />
            </div>
            <p className="text-center text-sm font-bold text-text-primary pt-2 pb-1">Share photo</p>
            <div className="px-5 pb-safe pb-6 pt-3 flex items-center justify-center gap-8">
              <button onClick={() => shareToWhatsapp(shareSheetPhoto)} className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 bg-green-500/15 hover:bg-green-500/25 rounded-2xl flex items-center justify-center transition-colors">
                  <svg className="w-7 h-7 text-green-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.198.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 1.9.525 3.68 1.438 5.2L2 22l4.938-1.396A9.94 9.94 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18.148a8.11 8.11 0 01-4.13-1.13l-.296-.176-3.05.862.833-3.037-.192-.311A8.113 8.113 0 013.89 12c0-4.478 3.632-8.11 8.11-8.11 4.477 0 8.11 3.632 8.11 8.11 0 4.477-3.633 8.148-8.11 8.148z" />
                  </svg>
                </div>
                <span className="text-xs text-muted font-medium">WhatsApp</span>
              </button>
              <button onClick={() => shareMore(shareSheetPhoto)} className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 bg-border/50 hover:bg-border rounded-2xl flex items-center justify-center transition-colors">
                  <svg className="w-7 h-7 text-text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                  </svg>
                </div>
                <span className="text-xs text-muted font-medium">More</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border px-4 py-3.5 text-center">
        <p className="text-xs text-muted font-semibold uppercase tracking-widest">{project?.studioName}</p>
        {project && (
          <h1 className="text-sm font-bold text-text-primary mt-0.5">
            {EVENT_ICON[project.eventType] ?? '📷'} {eventLabel} · {eventDate}
          </h1>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 pb-16">

        {/* IDLE / ERROR — selfie prompt */}
        {(stage === 'IDLE' || stage === 'ERROR') && (
          <div className="space-y-5">
            <div className="text-center space-y-2 pt-4">
              <div className="text-6xl">📸</div>
              <h2 className="text-2xl font-bold text-text-primary">Find your photos</h2>
              <p className="text-sm text-muted max-w-xs mx-auto leading-relaxed">
                Take a quick selfie and we&apos;ll instantly find all photos with you from this event.
              </p>
            </div>

            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400 text-center">{errorMsg}</div>
            )}

            <div className="flex flex-col gap-3 pt-2">
              <button
                onClick={startCamera}
                className="w-full bg-accent text-bg text-base font-bold py-4 rounded-2xl hover:bg-accent/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Take a Selfie
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border border-border text-sm text-muted font-semibold py-3.5 rounded-2xl hover:text-text-primary hover:border-accent/40 active:scale-[0.98] transition-all"
              >
                Upload from gallery
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            </div>
            <p className="text-[11px] text-muted/50 text-center">Your selfie is used only to find your photos and is never stored.</p>
          </div>
        )}

        {/* CAPTURING — camera */}
        {stage === 'CAPTURING' && (
          <div className="space-y-4">
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4] max-h-[70vh]">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-40 h-52 rounded-full border-2 border-white/50 border-dashed" />
              </div>
              <p className="absolute bottom-4 left-0 right-0 text-center text-white/70 text-xs">Position your face in the oval</p>
            </div>
            <canvas ref={canvasRef} className="hidden" />
            <button
              onClick={captureAndSearch}
              className="w-full bg-accent text-bg text-base font-bold py-4 rounded-2xl hover:bg-accent/90 active:scale-[0.98] transition-all"
            >
              Take Photo
            </button>
            <button
              onClick={() => { stopCamera(); setStage('IDLE') }}
              className="w-full text-sm text-muted hover:text-text-primary transition-colors py-2"
            >
              Cancel
            </button>
          </div>
        )}

        {/* SEARCHING */}
        {stage === 'SEARCHING' && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="w-12 h-12 border-[3px] border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-base font-semibold text-text-primary">Finding your photos…</p>
            <p className="text-sm text-muted">This takes just a moment</p>
          </div>
        )}

        {/* NO_FACE */}
        {stage === 'NO_FACE' && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="text-6xl">😶</div>
            <h2 className="text-xl font-bold text-text-primary">No face detected</h2>
            <p className="text-sm text-muted max-w-xs mx-auto">Make sure your face is clearly visible, well-lit, and facing the camera directly.</p>
            <button onClick={reset} className="mt-4 bg-accent text-bg font-bold px-10 py-3.5 rounded-2xl hover:bg-accent/90 active:scale-[0.98] transition-all">
              Try Again
            </button>
          </div>
        )}

        {/* NO_MATCH */}
        {stage === 'NO_MATCH' && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="text-6xl">🔍</div>
            <h2 className="text-xl font-bold text-text-primary">No photos found</h2>
            <p className="text-sm text-muted max-w-xs mx-auto">We couldn&apos;t find photos matching your face. Try a clearer selfie in good lighting.</p>
            <button onClick={reset} className="mt-4 bg-accent text-bg font-bold px-10 py-3.5 rounded-2xl hover:bg-accent/90 active:scale-[0.98] transition-all">
              Try Again
            </button>
          </div>
        )}

        {/* RESULTS — scrollable gallery */}
        {stage === 'RESULTS' && (
          <div className="space-y-4">
            {/* Result header */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-text-primary">✨ {photos.length} photos found</h2>
                <p className="text-xs text-muted mt-0.5">Tap to select · Double-tap or ⤢ to view</p>
              </div>
              <button
                onClick={reset}
                className="flex-shrink-0 text-xs text-muted hover:text-text-primary transition-colors border border-border px-3 py-1.5 rounded-xl"
              >
                New search
              </button>
            </div>

            {/* Photo grid */}
            <div ref={gridRef} className="relative" onMouseDown={handleGridMouseDown}>
              <div className="grid grid-cols-3 gap-1">
                {photos.map((photo, idx) => {
                  const isSelected = selected.has(photo.fileId)
                  return (
                    <div
                      key={photo.fileId}
                      data-fileid={photo.fileId}
                      onClick={() => handleTileClick(photo.fileId)}
                      onDoubleClick={(e) => { e.stopPropagation(); setLightboxIdx(idx) }}
                      className={`relative aspect-square bg-border/30 rounded-xl overflow-hidden group cursor-pointer select-none transition-all
                        ${isSelected ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : 'ring-1 ring-transparent'}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.previewUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        draggable={false}
                      />
                      {isSelected && <div className="absolute inset-0 bg-accent/20 pointer-events-none" />}
                      {isSelected && (
                        <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-accent flex items-center justify-center pointer-events-none">
                          <svg className="w-3 h-3 text-bg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </div>
                      )}
                      <button
                        data-no-drag
                        onClick={(e) => { e.stopPropagation(); setLightboxIdx(idx) }}
                        className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="View full size"
                      >⤢</button>
                    </div>
                  )
                })}
              </div>
              {dragRect && (
                <div className="absolute border-2 border-accent bg-accent/10 pointer-events-none rounded"
                  style={{ left: dragRect.left, top: dragRect.top, width: dragRect.width, height: dragRect.height }} />
              )}
            </div>

            <p className="text-[11px] text-muted/50 text-center pb-2">
              Drag to select multiple · Tap to select one
            </p>
          </div>
        )}
      </div>

      {/* Floating bulk-download bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-5 inset-x-4 z-30 flex justify-center">
          <div className="bg-card/80 backdrop-blur-xl border border-border/70 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center gap-1 px-2 py-2.5">
              <button onClick={clearSelection} className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl hover:bg-border/60 transition-colors text-muted hover:text-text-primary" aria-label="Clear selection">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="font-bold text-sm text-text-primary">{selected.size} selected</span>
              </div>
              <button onClick={downloadSelected} className="bg-accent text-bg font-bold px-4 py-2 rounded-xl hover:bg-accent/90 active:scale-[0.97] transition-all text-sm whitespace-nowrap flex-shrink-0">
                Download {selected.size}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
