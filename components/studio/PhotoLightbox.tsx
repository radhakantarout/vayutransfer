'use client'

import { useEffect, useRef } from 'react'

export interface LightboxPhoto {
  fileId:      string
  previewUrl:  string
  filename:    string
  // Absent/'IMAGE' renders <img> as before — 'VIDEO' renders a real <video
  // controls> element instead. First used by VayuStudios Moments, which is
  // also the first surface to render any video at all in a gallery grid.
  fileType?: 'IMAGE' | 'VIDEO'
  // VIDEO only — a static poster-frame JPEG (lambda/vayustudio-vidtranscode).
  // The thumbnail strip below can only ever render <img>, so a VIDEO entry
  // with no thumbnailUrl falls back to previewUrl, which is the actual mp4
  // and renders as a broken image — this field is what fixes that.
  thumbnailUrl?: string
  // Moments role only — drives the bottom-left love/comment pills. Optional
  // everywhere else, so Client/Guest/Admin usages (which never populate
  // these) are unaffected.
  likeCount?: number
  commentCount?: number
  likedByMe?: boolean
}

interface Props {
  photos: LightboxPhoto[]
  index: number
  onIndexChange: (i: number) => void
  onClose: () => void
  // Drives which action icons render in the header row. 'guest' gets exactly
  // Download + Share — no star, no info, no admin/client-only actions. The
  // 'admin' branch exists so this component can be adopted by that surface
  // later without a rewrite, but nothing wires it up yet — it keeps its own
  // independent lightbox implementation. 'moments' is VayuStudios Moments'
  // own gallery-owner view: Delete instead of Select (no client-selection
  // concept there — the uploader IS the admin of their own gallery).
  role: 'guest' | 'client' | 'moments' | 'admin'
  onDownload?: (photo: LightboxPhoto) => void
  onShare?: (photo: LightboxPhoto) => void
  // Client role only — the same love/select toggle the grid tile itself
  // already has, surfaced here too so selecting doesn't require closing the
  // lightbox first.
  isSelected?: (photo: LightboxPhoto) => boolean
  onToggleSelect?: (photo: LightboxPhoto) => void
  // Moments role only, so far — deletes the current photo/video outright.
  onDelete?: (photo: LightboxPhoto) => void
  // Moments role only — Info opens a sheet the PARENT renders (it has the
  // richer file record; this component only ever sees LightboxPhoto's
  // slim shape), Love/Comments mirror the grid tile's own pills exactly.
  onInfo?: (photo: LightboxPhoto) => void
  onToggleLike?: (photo: LightboxPhoto) => void
  onOpenComments?: (photo: LightboxPhoto) => void
}

const THUMB_STEP = 64 // 56px (w-14) thumbnail + 8px (gap-2)

export default function PhotoLightbox({
  photos, index, onIndexChange, onClose, role, onDownload, onShare, isSelected, onToggleSelect, onDelete,
  onInfo, onToggleLike, onOpenComments,
}: Props) {
  const touchStartX = useRef(0)
  const stripRef = useRef<HTMLDivElement>(null)
  const scrollRaf = useRef<number | null>(null)
  // Guards against a real feedback loop: a *smooth* programmatic scroll
  // fires many intermediate onScroll events while it's animating, each of
  // which could momentarily compute a different "centered" index than the
  // final target — without this guard those get reported as real index
  // changes mid-flight, which re-triggers the re-center effect, which
  // restarts the scroll, etc. (This is what was actually behind the
  // reported "video crashes" — the <video> element's key kept changing out
  // from under it as the index thrashed.) Ignoring scroll events for the
  // duration of our own animation fixes it; real user scrolling is
  // unaffected since it never sets this flag.
  const autoScrolling = useRef(false)
  const autoScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const current = photos[index]

  // Without this, a pending rAF from handleStripScroll can fire after the
  // lightbox has already been closed/unmounted — its callback still holds
  // the (now stale) onIndexChange closure and calls it anyway, which in the
  // parent flips lightboxIndex from null back to a number, silently
  // reopening the viewer a frame after the user closed it.
  useEffect(() => {
    return () => { if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current) }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     onClose()
      if (e.key === 'ArrowLeft')  onIndexChange(Math.max(0, index - 1))
      if (e.key === 'ArrowRight') onIndexChange(Math.min(photos.length - 1, index + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, photos.length, onClose, onIndexChange])

  // Re-centers the thumbnail strip whenever `index` changes from any other
  // source (arrows, swipe, keyboard, or its own scroll handler below).
  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    const target = index * THUMB_STEP
    if (Math.abs(el.scrollLeft - target) < 1) return // already there — nothing to guard
    autoScrolling.current = true
    el.scrollTo({ left: target, behavior: 'smooth' })
    if (autoScrollTimer.current) clearTimeout(autoScrollTimer.current)
    autoScrollTimer.current = setTimeout(() => { autoScrolling.current = false }, 400)
    return () => { if (autoScrollTimer.current) clearTimeout(autoScrollTimer.current) }
  }, [index])

  if (!current) return null

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) < 50) return
    if (diff > 0) onIndexChange(Math.min(photos.length - 1, index + 1))
    else          onIndexChange(Math.max(0, index - 1))
  }

  // Whichever thumbnail is centered while scrolling becomes the active
  // full-view photo, live — not just on tap or on scroll-end. Every
  // thumbnail is a fixed size, so the centered index is directly computable
  // from scrollLeft, no DOM measurement needed. rAF-throttled since this
  // fires continuously during a drag/momentum scroll.
  const handleStripScroll = () => {
    if (autoScrolling.current) return
    if (scrollRaf.current) return
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = null
      const el = stripRef.current
      if (!el) return
      const centered = Math.max(0, Math.min(photos.length - 1, Math.round(el.scrollLeft / THUMB_STEP)))
      if (centered !== index) onIndexChange(centered)
    })
  }

  // Moments-only: the current photo itself, heavily blurred and dimmed,
  // fills the backdrop instead of flat black — gated behind role so
  // Client/Guest/Admin lightboxes render byte-identical to before.
  const momentsBackdrop = role === 'moments' && current.fileType !== 'VIDEO'

  return (
    <div className={`fixed inset-0 z-[70] flex flex-col ${momentsBackdrop ? 'bg-black' : 'bg-black/95'}`} onClick={onClose}>
      {momentsBackdrop && (
        <>
          <div
            className="absolute inset-0 z-0 bg-cover bg-center scale-110 blur-3xl opacity-50"
            style={{ backgroundImage: `url(${current.previewUrl})` }}
            aria-hidden
          />
          <div className="absolute inset-0 z-0 bg-black/45" aria-hidden />
        </>
      )}
      {/* Header */}
      <div className="relative z-10 flex flex-col gap-2 px-4 pt-4 pb-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
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

        {role === 'moments' && (
          <div className="flex items-center gap-1.5">
            {onInfo && (
              <button onClick={() => onInfo(current)} title="Info"
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
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
            {onDownload && (
              <button onClick={() => onDownload(current)} title="Download"
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              </button>
            )}
            {onDelete && (
              <button onClick={() => onDelete(current)} title="Delete"
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl bg-white/10 hover:bg-danger/80 transition-colors">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main media */}
      <div className="relative z-10 flex-1 flex items-center justify-center overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={e => e.stopPropagation()}>
        {current.fileType === 'VIDEO' ? (
          // muted+playsInline are load-bearing, not stylistic — autoplay
          // with sound is silently blocked by every browser anyway, and
          // without playsInline iOS Safari forces native fullscreen the
          // instant autoplay fires, colliding with this lightbox's own
          // fixed overlay (the exact "video crashes in full view" bug).
          <video key={current.fileId}
            src={current.previewUrl}
            controls
            autoPlay
            muted
            playsInline
            className="max-h-full max-w-full select-none" />
        ) : (
          <img key={current.fileId}
            src={current.previewUrl}
            alt={current.filename}
            className="max-h-full max-w-full object-contain select-none"
            draggable={false} />
        )}
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
        {role === 'moments' && (onToggleLike || onOpenComments) && (
          <div className="absolute bottom-4 left-4 flex items-center gap-2" onClick={e => e.stopPropagation()}>
            {onToggleLike && (
              <button onClick={() => onToggleLike(current)}
                className="flex items-center gap-1 bg-black/55 rounded-full px-2.5 py-1.5 text-white text-xs font-semibold">
                <span className={current.likedByMe ? 'text-rose-500' : ''}>{current.likedByMe ? '❤️' : '🤍'}</span>
                {(current.likeCount ?? 0) > 0 && <span>{current.likeCount}</span>}
              </button>
            )}
            {onOpenComments && (
              <button onClick={() => onOpenComments(current)}
                className="flex items-center gap-1 bg-black/55 rounded-full px-2.5 py-1.5 text-white text-xs font-semibold">
                <span>💬</span>
                {(current.commentCount ?? 0) > 0 && <span>{current.commentCount}</span>}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Thumbnail strip — scroll-driven: whichever thumbnail ends up
          centered becomes the active full-view photo, live. Spacer elements
          at both ends let the first/last thumbnails actually reach center. */}
      {photos.length > 1 && (
        <div
          ref={stripRef}
          onScroll={handleStripScroll}
          className="relative z-10 flex-shrink-0 flex items-center gap-2 overflow-x-auto px-0 pb-6 pt-3 snap-x snap-mandatory scrollbar-hide"
          onClick={e => e.stopPropagation()}
        >
          <div style={{ width: 'calc(50% - 28px)' }} className="flex-shrink-0" aria-hidden />
          {photos.map((photo, idx) => (
            <button key={photo.fileId} onClick={() => onIndexChange(idx)}
              className={`relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden snap-center border-2 transition-all ${
                idx === index ? 'border-accent scale-105' : 'border-white/20 opacity-60'}`}>
              <img src={photo.fileType === 'VIDEO' ? (photo.thumbnailUrl ?? photo.previewUrl) : photo.previewUrl} alt="" className="w-full h-full object-cover" />
              {photo.fileType === 'VIDEO' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-0 h-0 border-y-[5px] border-y-transparent border-l-[8px] border-l-white/90 ml-0.5" />
                </div>
              )}
            </button>
          ))}
          <div style={{ width: 'calc(50% - 28px)' }} className="flex-shrink-0" aria-hidden />
        </div>
      )}
    </div>
  )
}
