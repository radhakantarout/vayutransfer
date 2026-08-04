'use client'

import { useEffect, useRef } from 'react'

export interface LightboxPhoto {
  fileId:      string
  previewUrl:  string
  filename:    string
}

interface Props {
  photos: LightboxPhoto[]
  index: number
  onIndexChange: (i: number) => void
  onClose: () => void
  // Drives which action icons render in the header row. 'guest' gets exactly
  // Download + Share — no star, no info, no admin/client-only actions. The
  // 'client'/'admin' branches exist so this component can be adopted by
  // those surfaces later without a rewrite, but nothing wires them up yet —
  // both currently keep their own independent lightbox implementations.
  role: 'guest' | 'client' | 'admin'
  onDownload?: (photo: LightboxPhoto) => void
  onShare?: (photo: LightboxPhoto) => void
  // Client role only — the same love/select toggle the grid tile itself
  // already has, surfaced here too so selecting doesn't require closing the
  // lightbox first.
  isSelected?: (photo: LightboxPhoto) => boolean
  onToggleSelect?: (photo: LightboxPhoto) => void
}

export default function PhotoLightbox({ photos, index, onIndexChange, onClose, role, onDownload, onShare, isSelected, onToggleSelect }: Props) {
  const touchStartX = useRef(0)
  const current = photos[index]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     onClose()
      if (e.key === 'ArrowLeft')  onIndexChange(Math.max(0, index - 1))
      if (e.key === 'ArrowRight') onIndexChange(Math.min(photos.length - 1, index + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, photos.length, onClose, onIndexChange])

  if (!current) return null

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) < 50) return
    if (diff > 0) onIndexChange(Math.min(photos.length - 1, index + 1))
    else          onIndexChange(Math.max(0, index - 1))
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/95 flex flex-col" onClick={onClose}>
      {/* Header */}
      <div className="flex flex-col gap-2 px-4 pt-4 pb-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-white/50 text-xs font-semibold flex-shrink-0">{index + 1} / {photos.length}</span>
            <span className="text-white font-semibold text-sm truncate">{current.filename}</span>
          </div>
          <button onClick={onClose} title="Close"
            className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {role === 'guest' && (
          <div className="flex items-center gap-1.5">
            {onDownload && (
              <button onClick={() => onDownload(current)} title="Download"
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              </button>
            )}
            {onShare && (
              <button onClick={() => onShare(current)} title="Share"
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                </svg>
              </button>
            )}
          </div>
        )}

        {role === 'client' && (
          <div className="flex items-center gap-1.5">
            {onToggleSelect && (
              <button onClick={() => onToggleSelect(current)} title={isSelected?.(current) ? 'Unselect' : 'Select'}
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                <svg className={`w-4 h-4 ${isSelected?.(current) ? 'text-rose-500' : 'text-white'}`}
                  viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} fill={isSelected?.(current) ? 'currentColor' : 'none'}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" />
                </svg>
              </button>
            )}
            {onDownload && (
              <button onClick={() => onDownload(current)} title="Download"
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main image */}
      <div className="flex-1 flex items-center justify-center overflow-hidden relative"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={e => e.stopPropagation()}>
        <img key={current.fileId}
          src={current.previewUrl}
          alt={current.filename}
          className="max-h-full max-w-full object-contain select-none"
          draggable={false} />
        {index > 0 && (
          <button onClick={() => onIndexChange(index - 1)}
            className="absolute left-3 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/75 active:scale-95 transition-all border border-white/20">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
        )}
        {index < photos.length - 1 && (
          <button onClick={() => onIndexChange(index + 1)}
            className="absolute right-3 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/75 active:scale-95 transition-all border border-white/20">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      {photos.length > 1 && (
        <div className="flex-shrink-0 flex gap-2 overflow-x-auto px-4 pb-6 pt-3 snap-x snap-mandatory scrollbar-hide" onClick={e => e.stopPropagation()}>
          {photos.map((photo, idx) => (
            <button key={photo.fileId} onClick={() => onIndexChange(idx)}
              className={`relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden snap-start border-2 transition-all ${
                idx === index ? 'border-accent scale-105' : 'border-white/20 opacity-60'}`}>
              <img src={photo.previewUrl} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
