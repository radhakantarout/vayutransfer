'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import InAppBrowserGuard from '@/components/studio/InAppBrowserGuard'

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
  const [activePhoto, setActivePhoto] = useState<GuestPhoto | null>(null)
  const [shareToast, setShareToast] = useState(false)
  const [errorMsg, setErrorMsg]     = useState('')

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

  const handleShare = async (photo: GuestPhoto) => {
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

  const reset = () => { stopCamera(); setPhotos([]); setActivePhoto(null); setErrorMsg(''); setStage('IDLE') }

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

  const eventLabel = project ? project.eventType.replace(/_/g, ' ') : ''
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

      {/* Photo detail bottom sheet */}
      {activePhoto && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          onClick={() => setActivePhoto(null)}
        >
          <div className="absolute inset-0 bg-black/80" />
          <div
            className="relative bg-card rounded-t-3xl overflow-hidden flex flex-col"
            style={{ maxHeight: '92vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-border rounded-full" />
            </div>

            {/* Close button */}
            <button
              onClick={() => setActivePhoto(null)}
              className="absolute top-3 right-3 w-8 h-8 bg-black/20 hover:bg-black/40 rounded-full flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <svg className="w-4 h-4 text-text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Photo preview */}
            <div className="bg-black flex items-center justify-center overflow-hidden" style={{ height: '55vmax', maxHeight: '62vh' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activePhoto.previewUrl}
                alt={activePhoto.filename}
                className="max-w-full max-h-full object-contain"
                draggable={false}
              />
            </div>

            {/* File name */}
            <p className="px-5 pt-4 pb-2 text-sm text-muted truncate">
              {activePhoto.filename}
            </p>

            {/* Action buttons */}
            <div className="flex items-center justify-center gap-6 px-6 py-4 pb-safe">
              {/* View full size */}
              <a
                href={activePhoto.downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center gap-2"
              >
                <div className="w-16 h-16 bg-border/50 hover:bg-border rounded-2xl flex items-center justify-center transition-colors">
                  <svg className="w-7 h-7 text-text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <span className="text-xs text-muted font-medium">View</span>
              </a>

              {/* Download */}
              <a
                href={`/studio/api/guest/${token}/download/${activePhoto.fileId}`}
                download={activePhoto.filename}
                className="flex flex-col items-center gap-2"
              >
                <div className="w-16 h-16 bg-accent/15 hover:bg-accent/25 rounded-2xl flex items-center justify-center transition-colors">
                  <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                </div>
                <span className="text-xs text-accent font-semibold">Download</span>
              </a>

              {/* Share */}
              <button
                onClick={() => handleShare(activePhoto)}
                className="flex flex-col items-center gap-2"
              >
                <div className="w-16 h-16 bg-border/50 hover:bg-border rounded-2xl flex items-center justify-center transition-colors">
                  <svg className="w-7 h-7 text-text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                  </svg>
                </div>
                <span className="text-xs text-muted font-medium">Share</span>
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
                <p className="text-xs text-muted mt-0.5">Tap any photo to view, download or share</p>
              </div>
              <button
                onClick={reset}
                className="flex-shrink-0 text-xs text-muted hover:text-text-primary transition-colors border border-border px-3 py-1.5 rounded-xl"
              >
                New search
              </button>
            </div>

            {/* Photo grid */}
            <div className="grid grid-cols-3 gap-1">
              {photos.map(photo => (
                <button
                  key={photo.fileId}
                  onClick={() => setActivePhoto(photo)}
                  className="relative aspect-square bg-border/30 rounded-xl overflow-hidden group active:scale-[0.95] transition-transform"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.previewUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                    draggable={false}
                  />
                  {/* Hover/tap overlay with eye icon */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 group-active:bg-black/30 transition-colors flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity">
                      <svg className="w-6 h-6 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <p className="text-[11px] text-muted/50 text-center pb-2">
              Tap any photo · Download or share individually
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
