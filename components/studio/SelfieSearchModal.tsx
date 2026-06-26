'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import type { MediaFile } from '@/types/studio'

type Stage = 'IDLE' | 'CAPTURING' | 'UPLOADING' | 'RESULTS' | 'NO_MATCH' | 'NO_FACE' | 'ERROR'

interface Props {
  token: string
  onClose: () => void
  onResults: (photos: MediaFile[]) => void
}

export default function SelfieSearchModal({ token, onClose, onResults }: Props): React.ReactElement {
  const [stage, setStage]           = useState<Stage>('IDLE')
  const [errorMsg, setErrorMsg]     = useState('')
  const [resultCount, setResultCount] = useState(0)
  const videoRef    = useRef<HTMLVideoElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  const startCamera = async () => {
    setStage('CAPTURING')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
    } catch {
      setStage('ERROR')
      setErrorMsg('Camera access denied. Try uploading a photo instead.')
    }
  }

  const captureAndSearch = () => {
    if (!videoRef.current || !canvasRef.current) return
    const video  = videoRef.current
    const canvas = canvasRef.current
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    stopCamera()
    canvas.toBlob(blob => {
      if (blob) sendSelfie(blob, 'image/jpeg')
    }, 'image/jpeg', 0.92)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setStage('ERROR'); setErrorMsg('Photo must be under 5 MB'); return }
    sendSelfie(file, file.type)
  }

  const sendSelfie = async (blob: Blob, mimeType: string) => {
    stopCamera()
    setStage('UPLOADING')
    try {
      const form = new FormData()
      form.append('selfie', new File([blob], 'selfie.jpg', { type: mimeType }))
      const res = await fetch(`/studio/api/client/gallery/${token}/selfie-search`, {
        method: 'POST', body: form,
      }).then(r => r.json())

      if (!res.success) {
        if (res.error === 'NOT_INDEXED_YET') { setStage('ERROR'); setErrorMsg("The studio hasn't enabled face search yet."); return }
        setStage('ERROR'); setErrorMsg('Something went wrong. Please try again.'); return
      }

      const { error, totalPhotos, photos } = res.data
      if (error === 'NO_FACE_DETECTED') { setStage('NO_FACE'); return }
      if (totalPhotos === 0) { setStage('NO_MATCH'); return }
      setResultCount(totalPhotos)
      setStage('RESULTS')
      onResults(photos)
    } catch {
      setStage('ERROR')
      setErrorMsg('Network error. Please try again.')
    }
  }

  const reset = () => { stopCamera(); setStage('IDLE'); setErrorMsg('') }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-base font-bold text-text-primary">Find my photos</h2>
          <button onClick={() => { stopCamera(); onClose() }} className="text-muted hover:text-text-primary">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 pb-6 space-y-4">

          {/* IDLE */}
          {stage === 'IDLE' && (
            <>
              <p className="text-sm text-muted">Take a quick selfie and we'll find all your photos instantly.</p>
              <div className="flex flex-col gap-2">
                <button onClick={startCamera}
                  className="w-full bg-accent text-bg text-sm font-semibold py-3 rounded-xl hover:bg-accent/90 transition-colors flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Open Camera
                </button>
                <button onClick={() => fileInputRef.current?.click()}
                  className="w-full border border-border text-sm text-muted font-semibold py-3 rounded-xl hover:text-text-primary hover:border-accent/40 transition-colors">
                  Upload a photo
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
              </div>
              <p className="text-[11px] text-muted/60 text-center">Your selfie is used only to find your photos and is not stored.</p>
            </>
          )}

          {/* CAPTURING */}
          {stage === 'CAPTURING' && (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                {/* Face oval guide */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-32 h-40 rounded-full border-2 border-white/60 border-dashed" />
                </div>
              </div>
              <canvas ref={canvasRef} className="hidden" />
              <button onClick={captureAndSearch}
                className="w-full bg-accent text-bg text-sm font-semibold py-3 rounded-xl hover:bg-accent/90 transition-colors">
                Take Photo
              </button>
              <button onClick={reset} className="w-full text-xs text-muted hover:text-text-primary transition-colors">Cancel</button>
            </div>
          )}

          {/* UPLOADING */}
          {stage === 'UPLOADING' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted">Finding your photos…</p>
            </div>
          )}

          {/* RESULTS */}
          {stage === 'RESULTS' && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="text-4xl">✨</div>
              <p className="text-base font-bold text-text-primary">We found {resultCount} photo{resultCount !== 1 ? 's' : ''} with you!</p>
              <button onClick={() => { stopCamera(); onClose() }}
                className="w-full bg-accent text-bg text-sm font-semibold py-3 rounded-xl hover:bg-accent/90 transition-colors">
                See my photos
              </button>
            </div>
          )}

          {/* NO_MATCH */}
          {stage === 'NO_MATCH' && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="text-3xl">🔍</div>
              <p className="text-sm font-semibold text-text-primary">No photos found</p>
              <p className="text-xs text-muted">Try a clearer selfie in good lighting, facing the camera directly.</p>
              <button onClick={reset} className="w-full border border-border text-sm text-muted font-semibold py-2.5 rounded-xl hover:text-text-primary transition-colors">Try Again</button>
            </div>
          )}

          {/* NO_FACE */}
          {stage === 'NO_FACE' && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="text-3xl">😶</div>
              <p className="text-sm font-semibold text-text-primary">Could not detect a face</p>
              <p className="text-xs text-muted">Make sure your face is clearly visible and well-lit.</p>
              <button onClick={reset} className="w-full border border-border text-sm text-muted font-semibold py-2.5 rounded-xl hover:text-text-primary transition-colors">Try Again</button>
            </div>
          )}

          {/* ERROR */}
          {stage === 'ERROR' && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="text-3xl">⚠️</div>
              <p className="text-xs text-muted">{errorMsg}</p>
              <button onClick={reset} className="w-full border border-border text-sm text-muted font-semibold py-2.5 rounded-xl hover:text-text-primary transition-colors">Try Again</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
