'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'

interface GuestPhoto {
  fileId:      string
  previewUrl:  string
  filename:    string
  downloadUrl: string
}

interface ProjectInfo {
  eventType:   string
  clientName:  string
  eventDate:   string
  studioName:  string
  expiresAt:   string
}

type Stage = 'LOADING' | 'IDLE' | 'CAPTURING' | 'SEARCHING' | 'RESULTS' | 'NO_MATCH' | 'NO_FACE' | 'EXPIRED' | 'ERROR'

const EVENT_ICON: Record<string, string> = {
  WEDDING: '💒', MEHENDI: '🪔', RECEPTION: '🎊', ENGAGEMENT: '💍',
  PRE_WEDDING: '📸', BIRTHDAY: '🎂', CORPORATE: '🏢', SCHOOL: '🎒', OTHER: '📷',
}

export default function GuestPage() {
  const { token } = useParams<{ token: string }>()

  const [stage, setStage]         = useState<Stage>('LOADING')
  const [project, setProject]     = useState<ProjectInfo | null>(null)
  const [photos, setPhotos]       = useState<GuestPhoto[]>([])
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [lightbox, setLightbox]   = useState<number | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [errorMsg, setErrorMsg]   = useState('')

  const videoRef    = useRef<HTMLVideoElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  // Validate token on mount
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
    const v = videoRef.current; const c = canvasRef.current
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
        if (res.error === 'NOT_INDEXED_YET') { setStage('ERROR'); setErrorMsg("Photos haven't been set up for face search yet. Please contact your photographer."); return }
        setStage('ERROR'); setErrorMsg('Something went wrong. Please try again.'); return
      }

      const { error, photos: found } = res.data
      if (error === 'NO_FACE_DETECTED') { setStage('NO_FACE'); return }
      if (!found?.length) { setStage('NO_MATCH'); return }

      setPhotos(found)
      setSelected(new Set(found.map((p: GuestPhoto) => p.fileId)))
      setStage('RESULTS')
    } catch {
      setStage('ERROR')
      setErrorMsg('Network error. Please check your connection and try again.')
    }
  }

  const toggleSelect = (fileId: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(fileId) ? next.delete(fileId) : next.add(fileId)
      return next
    })
  }

  const downloadSelected = async () => {
    const toDownload = photos.filter(p => selected.has(p.fileId))
    if (!toDownload.length) return
    setDownloading(true)
    for (const photo of toDownload) {
      const url = `/studio/api/guest/${token}/download/${photo.fileId}`
      const a = document.createElement('a')
      a.href = url; a.download = photo.filename; a.target = '_blank'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      await new Promise(r => setTimeout(r, 400))
    }
    setDownloading(false)
  }

  const reset = () => { stopCamera(); setPhotos([]); setSelected(new Set()); setErrorMsg(''); setStage('IDLE') }

  // ── Expired ───────────────────────────────────────────────────────────
  if (stage === 'EXPIRED') return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="text-center space-y-4 max-w-xs">
        <div className="text-5xl">⏰</div>
        <h1 className="text-lg font-bold text-text-primary">QR Code Expired</h1>
        <p className="text-sm text-muted">This QR code has expired. Please ask your photographer for a new one.</p>
      </div>
    </div>
  )

  // ── Loading ───────────────────────────────────────────────────────────
  if (stage === 'LOADING') return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const eventLabel = project ? `${project.eventType.replace(/_/g, ' ')}` : ''
  const eventDate  = project ? new Date(project.eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

  return (
    <div className="min-h-screen bg-bg pb-10">

      {/* Lightbox */}
      {lightbox !== null && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl w-10 h-10 flex items-center justify-center" onClick={() => setLightbox(null)}>✕</button>
          <button className="absolute left-3 text-white/60 hover:text-white text-4xl w-12 h-12 flex items-center justify-center disabled:opacity-20"
            disabled={lightbox === 0} onClick={e => { e.stopPropagation(); setLightbox(i => Math.max(0, (i ?? 1) - 1)) }}>‹</button>
          <button className="absolute right-3 text-white/60 hover:text-white text-4xl w-12 h-12 flex items-center justify-center disabled:opacity-20"
            disabled={lightbox === photos.length - 1} onClick={e => { e.stopPropagation(); setLightbox(i => Math.min(photos.length - 1, (i ?? 0) + 1)) }}>›</button>
          <img src={photos[lightbox]?.previewUrl} alt="" className="max-h-screen max-w-full object-contain px-16" onClick={e => e.stopPropagation()} draggable={false} />
          <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-4">
            <span className="text-white/40 text-sm">{lightbox + 1} / {photos.length}</span>
            <a href={`/studio/api/guest/${token}/download/${photos[lightbox]?.fileId}`} download={photos[lightbox]?.filename}
              className="text-xs bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl font-semibold transition-colors"
              onClick={e => e.stopPropagation()}>
              ⬇ Download
            </a>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-card border-b border-border px-4 py-4 text-center">
        <p className="text-xs text-muted font-semibold uppercase tracking-wider">{project?.studioName}</p>
        {project && (
          <h1 className="text-base font-bold text-text-primary mt-0.5">
            {EVENT_ICON[project.eventType] ?? '📷'} {eventLabel} · {eventDate}
          </h1>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6">

        {/* IDLE — selfie prompt */}
        {(stage === 'IDLE' || stage === 'ERROR') && (
          <div className="space-y-5">
            <div className="text-center space-y-2">
              <div className="text-5xl">📸</div>
              <h2 className="text-xl font-bold text-text-primary">Find your photos</h2>
              <p className="text-sm text-muted">Take a quick selfie and we&apos;ll find all photos with you instantly.</p>
            </div>

            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400 text-center">{errorMsg}</div>
            )}

            <div className="flex flex-col gap-3">
              <button onClick={startCamera}
                className="w-full bg-accent text-bg text-base font-bold py-4 rounded-2xl hover:bg-accent/90 transition-colors flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Take a Selfie
              </button>
              <button onClick={() => fileInputRef.current?.click()}
                className="w-full border border-border text-sm text-muted font-semibold py-3.5 rounded-2xl hover:text-text-primary hover:border-accent/40 transition-colors">
                Upload a photo from gallery
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
              {/* Face guide oval */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-40 h-52 rounded-full border-2 border-white/50 border-dashed" />
              </div>
              <p className="absolute bottom-4 left-0 right-0 text-center text-white/70 text-xs">Position your face in the oval</p>
            </div>
            <canvas ref={canvasRef} className="hidden" />
            <button onClick={captureAndSearch}
              className="w-full bg-accent text-bg text-base font-bold py-4 rounded-2xl hover:bg-accent/90 transition-colors">
              Take Photo
            </button>
            <button onClick={() => { stopCamera(); setStage('IDLE') }} className="w-full text-sm text-muted hover:text-text-primary transition-colors py-2">Cancel</button>
          </div>
        )}

        {/* SEARCHING */}
        {stage === 'SEARCHING' && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-base font-semibold text-text-primary">Finding your photos…</p>
            <p className="text-sm text-muted">This takes just a moment</p>
          </div>
        )}

        {/* NO_FACE */}
        {stage === 'NO_FACE' && (
          <div className="flex flex-col items-center gap-4 py-12 text-center space-y-2">
            <div className="text-5xl">😶</div>
            <h2 className="text-lg font-bold text-text-primary">Couldn&apos;t detect a face</h2>
            <p className="text-sm text-muted max-w-xs mx-auto">Make sure your face is clearly visible, well-lit, and facing the camera directly.</p>
            <button onClick={reset} className="mt-2 bg-accent text-bg font-bold px-8 py-3 rounded-2xl hover:bg-accent/90 transition-colors">Try Again</button>
          </div>
        )}

        {/* NO_MATCH */}
        {stage === 'NO_MATCH' && (
          <div className="flex flex-col items-center gap-4 py-12 text-center space-y-2">
            <div className="text-5xl">🔍</div>
            <h2 className="text-lg font-bold text-text-primary">No photos found</h2>
            <p className="text-sm text-muted max-w-xs mx-auto">We couldn&apos;t find photos matching your face. Try a clearer selfie in good lighting.</p>
            <button onClick={reset} className="mt-2 bg-accent text-bg font-bold px-8 py-3 rounded-2xl hover:bg-accent/90 transition-colors">Try Again</button>
          </div>
        )}

        {/* RESULTS */}
        {stage === 'RESULTS' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-text-primary">✨ {photos.length} photos found!</h2>
                <p className="text-xs text-muted mt-0.5">{selected.size} selected for download</p>
              </div>
              <button onClick={reset} className="text-xs text-muted hover:text-text-primary transition-colors border border-border px-3 py-1.5 rounded-lg">
                New search
              </button>
            </div>

            {/* Select all / deselect all */}
            <div className="flex gap-2">
              <button onClick={() => setSelected(new Set(photos.map(p => p.fileId)))}
                className="flex-1 text-xs border border-border text-muted py-2 rounded-xl hover:bg-border/40 transition-colors font-semibold">
                Select All
              </button>
              <button onClick={() => setSelected(new Set())}
                className="flex-1 text-xs border border-border text-muted py-2 rounded-xl hover:bg-border/40 transition-colors font-semibold">
                Deselect All
              </button>
            </div>

            {/* Photo grid */}
            <div className="grid grid-cols-3 gap-1.5">
              {photos.map((photo, idx) => {
                const isSelected = selected.has(photo.fileId)
                return (
                  <div key={photo.fileId} className="relative aspect-square">
                    <div
                      onClick={() => toggleSelect(photo.fileId)}
                      className={`w-full h-full rounded-xl overflow-hidden cursor-pointer transition-all duration-100
                        ${isSelected ? 'ring-2 ring-accent ring-offset-1 ring-offset-bg scale-[0.96]' : 'opacity-70'}`}
                    >
                      <img src={photo.previewUrl} alt="" className="w-full h-full object-cover" draggable={false} />
                    </div>
                    {/* Checkmark */}
                    {isSelected && (
                      <div className="absolute top-1.5 left-1.5 w-5 h-5 bg-accent rounded-full flex items-center justify-center shadow pointer-events-none">
                        <svg className="w-3 h-3 text-bg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                    {/* Expand */}
                    <button
                      onClick={e => { e.stopPropagation(); setLightbox(idx) }}
                      className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white text-xs flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                    >⤢</button>
                  </div>
                )
              })}
            </div>

            {/* Download button */}
            <button
              onClick={downloadSelected}
              disabled={selected.size === 0 || downloading}
              className="w-full bg-accent text-bg text-base font-bold py-4 rounded-2xl hover:bg-accent/90 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
            >
              {downloading ? (
                <><div className="w-4 h-4 border-2 border-bg border-t-transparent rounded-full animate-spin" /> Downloading…</>
              ) : (
                <><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Download {selected.size} Photo{selected.size !== 1 ? 's' : ''}</>
              )}
            </button>
            <p className="text-[11px] text-muted/50 text-center">Tap a photo to select / deselect · Tap ⤢ to preview</p>
          </div>
        )}
      </div>
    </div>
  )
}
