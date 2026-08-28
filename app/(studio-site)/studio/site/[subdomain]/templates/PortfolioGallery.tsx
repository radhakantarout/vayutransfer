'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

// `type` undefined means 'photo' — every gallery record created before video
// support existed has no value here and must keep rendering exactly as before.
interface GalleryItem { id: string; url: string; type?: 'photo' | 'video'; thumbnailUrl?: string; caption?: string; category?: string }

// Demo photos from /public — shown when the studio hasn't uploaded portfolio photos yet.
const DEMO_PHOTOS: GalleryItem[] = [
  { id: 'd1',  url: '/images/gallery/wedding/wedding_1.jpeg',                    category: 'Wedding' },
  { id: 'd2',  url: '/images/gallery/wedding/wedding_bengali.png',               category: 'Wedding' },
  { id: 'd3',  url: '/images/gallery/wedding/Wedding_punjabi.png',               category: 'Wedding' },
  { id: 'd4',  url: '/images/gallery/wedding/wedding_kerla.png',                 category: 'Wedding' },
  { id: 'd5',  url: '/images/gallery/pre-wedding/pre-wedding-banglore.png',      category: 'Pre-Wedding' },
  { id: 'd6',  url: '/images/gallery/pre-wedding/pre-wedding-konark.png',        category: 'Pre-Wedding' },
  { id: 'd7',  url: '/images/gallery/pre-wedding/pre-wedding_rajasthan.png',     category: 'Pre-Wedding' },
  { id: 'd8',  url: '/images/gallery/portfolio/1.png',                           category: 'Portrait' },
  { id: 'd9',  url: '/images/gallery/portfolio/2.png',                           category: 'Portrait' },
  { id: 'd10', url: '/images/gallery/corporate/1.png',                           category: 'Corporate' },
  { id: 'd11', url: '/images/gallery/corporate/2.png',                           category: 'Corporate' },
  { id: 'd12', url: '/images/gallery/fashion/1.png',                             category: 'Fashion' },
  { id: 'd13', url: '/images/gallery/fashion/2.png',                             category: 'Fashion' },
  { id: 'd14', url: '/images/gallery/school-college/1.png',                      category: 'School' },
  { id: 'd15', url: '/images/gallery/school-college/2.png',                      category: 'School' },
]

// ── AlbumBook (3D page-flip viewer) — photos only, unchanged behavior ───────

type PageContent =
  | { type: 'cover';  title: string; accent: string }
  | { type: 'photo';  src: string }
  | { type: 'blank' }

interface Spread { left: PageContent; right: PageContent }

function buildSpreads(photos: GalleryItem[], title: string, accent: string): Spread[] {
  const spreads: Spread[] = []
  spreads.push({ left: { type: 'blank' }, right: { type: 'cover', title, accent } })
  for (let i = 0; i < photos.length; i += 2) {
    spreads.push({
      left:  { type: 'photo', src: photos[i].url },
      right: photos[i + 1] ? { type: 'photo', src: photos[i + 1].url } : { type: 'blank' },
    })
  }
  spreads.push({ left: { type: 'blank' }, right: { type: 'blank' } })
  return spreads
}

function PageSlot({ content, accent }: { content: PageContent; accent: string }) {
  if (content.type === 'blank') return <div className="w-full h-full bg-neutral-900" />
  if (content.type === 'cover') return (
    <div className="w-full h-full flex flex-col items-center justify-center"
      style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}55)` }}>
      <div className="text-4xl mb-4">📷</div>
      <p className="text-white font-bold text-xl text-center px-4 leading-snug">{content.title}</p>
      <p className="text-white/50 text-xs mt-2 uppercase tracking-widest">Portfolio</p>
    </div>
  )
  return (
    <div className="w-full h-full relative bg-neutral-800 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={content.src} alt="Portfolio" loading="lazy"
        className="absolute inset-0 w-full h-full object-cover" />
    </div>
  )
}

function AlbumViewer({ photos, title, accent, onClose }: {
  photos: GalleryItem[]; title: string; accent: string; onClose: () => void
}) {
  const spreads = buildSpreads(photos, title, accent)
  const [current,    setCurrent]    = useState(0)
  const [flipping,   setFlipping]   = useState<'fwd' | 'bwd' | null>(null)
  const [flipAngle,  setFlipAngle]  = useState(0)
  const [pendingIdx, setPendingIdx] = useState(0)
  const touchX = useRef(0)

  const next = useCallback(() => {
    if (flipping || current >= spreads.length - 1) return
    const p = current + 1; setPendingIdx(p); setFlipping('fwd'); setFlipAngle(0)
    requestAnimationFrame(() => requestAnimationFrame(() => setFlipAngle(-180)))
  }, [flipping, current, spreads.length])

  const prev = useCallback(() => {
    if (flipping || current <= 0) return
    const p = current - 1; setPendingIdx(p); setFlipping('bwd'); setFlipAngle(0)
    requestAnimationFrame(() => requestAnimationFrame(() => setFlipAngle(180)))
  }, [flipping, current])

  const onFlipDone = useCallback(() => { setCurrent(pendingIdx); setFlipping(null); setFlipAngle(0) }, [pendingIdx])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft')  prev()
      if (e.key === 'Escape')     onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [next, prev, onClose])

  const curr = spreads[current]
  const pend = spreads[pendingIdx] ?? curr
  const isForward = flipping === 'fwd'

  const staticLeft   = isForward  ? curr.left  : (flipping === 'bwd' ? pend.left  : curr.left)
  const staticRight  = !isForward ? curr.right : (flipping === 'fwd' ? pend.right : curr.right)
  const turningFront = isForward  ? curr.right : curr.left
  const turningBack  = isForward  ? pend.left  : pend.right

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <button onClick={onClose}
        className="absolute top-4 right-4 text-white/60 hover:text-white text-2xl font-light leading-none">✕</button>

      <div className="relative w-full max-w-3xl" style={{ perspective: 1200 }}
        onTouchStart={e => { touchX.current = e.touches[0].clientX }}
        onTouchEnd={e => {
          const d = e.changedTouches[0].clientX - touchX.current
          if (d < -50) next(); else if (d > 50) prev()
        }}>
        <div className="flex shadow-2xl" style={{ height: 'min(60vw, 420px)' }}>
          <div className="flex-1 overflow-hidden border-r border-white/10">
            <PageSlot content={staticLeft} accent={accent} />
          </div>
          <div className="flex-1 overflow-hidden">
            <PageSlot content={staticRight} accent={accent} />
          </div>
          {flipping && (
            <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d', zIndex: 10 }}>
              <div style={{
                position: 'absolute', top: 0, bottom: 0,
                left: isForward ? '50%' : 0, width: '50%',
                transformOrigin: isForward ? 'left center' : 'right center',
                transform: `rotateY(${flipAngle}deg)`,
                transition: 'transform 0.55s ease-in-out',
                transformStyle: 'preserve-3d',
              }} onTransitionEnd={onFlipDone}>
                <div className="absolute inset-0 overflow-hidden" style={{ backfaceVisibility: 'hidden' }}>
                  <PageSlot content={turningFront} accent={accent} />
                </div>
                <div className="absolute inset-0 overflow-hidden"
                  style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                  <PageSlot content={turningBack} accent={accent} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-6 mt-6">
        <button onClick={prev} disabled={current === 0}
          className="px-5 py-2 rounded-full text-sm font-semibold text-white/70 hover:text-white border border-white/20 hover:border-white/50 disabled:opacity-30 transition-all">
          ← Prev
        </button>
        <span className="text-white/40 text-xs">{current + 1} / {spreads.length}</span>
        <button onClick={next} disabled={current >= spreads.length - 1}
          className="px-5 py-2 rounded-full text-sm font-semibold text-white/70 hover:text-white border border-white/20 hover:border-white/50 disabled:opacity-30 transition-all">
          Next →
        </button>
      </div>
    </div>
  )
}

// ── VideoLightbox — new, handles videos (and photos reached while arrowing
// through a mixed set); kept fully separate from AlbumViewer so the existing
// 3D flip-book stays untouched for photo-only galleries ────────────────────

function VideoLightbox({ items, startIndex, onClose }: {
  items: GalleryItem[]; startIndex: number; onClose: () => void
}) {
  const [index, setIndex] = useState(startIndex)
  const touchX = useRef(0)

  const next = useCallback(() => setIndex(i => Math.min(i + 1, items.length - 1)), [items.length])
  const prev = useCallback(() => setIndex(i => Math.max(i - 1, 0)), [])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft')  prev()
      if (e.key === 'Escape')     onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [next, prev, onClose])

  const item = items[index]
  if (!item) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      onTouchStart={e => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={e => {
        const d = e.changedTouches[0].clientX - touchX.current
        if (d < -50) next(); else if (d > 50) prev()
      }}>
      <button onClick={onClose}
        className="absolute top-4 right-4 text-white/60 hover:text-white text-2xl font-light leading-none z-10">✕</button>

      <div className="relative w-full max-w-4xl flex items-center justify-center" style={{ maxHeight: '78vh' }}>
        {item.type === 'video' ? (
          <video key={item.id} src={item.url} controls autoPlay playsInline
            className="max-w-full rounded-2xl shadow-2xl" style={{ maxHeight: '78vh' }} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={item.id} src={item.url} alt={item.caption ?? ''}
            className="max-w-full object-contain rounded-2xl shadow-2xl" style={{ maxHeight: '78vh' }} />
        )}
      </div>

      <div className="flex items-center gap-6 mt-6">
        <button onClick={prev} disabled={index === 0}
          className="px-5 py-2 rounded-full text-sm font-semibold text-white/70 hover:text-white border border-white/20 hover:border-white/50 disabled:opacity-30 transition-all">
          ← Prev
        </button>
        <span className="text-white/40 text-xs">{index + 1} / {items.length}</span>
        <button onClick={next} disabled={index >= items.length - 1}
          className="px-5 py-2 rounded-full text-sm font-semibold text-white/70 hover:text-white border border-white/20 hover:border-white/50 disabled:opacity-30 transition-all">
          Next →
        </button>
      </div>
    </div>
  )
}

// ── Main PortfolioGallery ────────────────────────────────────────────────────

export default function PortfolioGallery({ photos, studioName, accent = '#C9A84C', fontColor = '#ffffff' }: {
  photos: GalleryItem[]; studioName: string; accent?: string; fontColor?: string
}) {
  const isDemo = photos.length === 0
  const displayPhotos = isDemo ? DEMO_PHOTOS : photos

  const [activeCategory, setActiveCategory] = useState('All')
  const [album, setAlbum] = useState<{ photos: GalleryItem[]; title: string } | null>(null)
  const [lightbox, setLightbox] = useState<{ items: GalleryItem[]; index: number } | null>(null)

  const categories = ['All', ...Array.from(new Set(displayPhotos.map(p => p.category ?? 'General').filter(Boolean)))]
  const filtered   = activeCategory === 'All' ? displayPhotos : displayPhotos.filter(p => (p.category ?? 'General') === activeCategory)

  // Photo tiles keep opening the existing 3D flip-book (scoped to photo items
  // only, exactly like before video items existed). Video tiles open a
  // fullscreen lightbox that can arrow through the whole active filtered set.
  const openItem = (item: GalleryItem, indexInFiltered: number) => {
    if (item.type === 'video') {
      setLightbox({ items: filtered, index: indexInFiltered })
    } else {
      setAlbum({ photos: filtered.filter(p => p.type !== 'video'), title: activeCategory === 'All' ? studioName : activeCategory })
    }
  }

  return (
    <>
      {/* Demo notice banner */}
      {isDemo && (
        <div className="mb-6 px-4 py-3 rounded-xl text-center text-xs"
          style={{ background: `${accent}18`, border: `1px solid ${accent}33`, color: `${accent}cc` }}>
          These are sample photos. Log in to your dashboard → Website → Gallery to upload your real portfolio.
        </div>
      )}

      {/* Category tabs */}
      {categories.length > 2 && (
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={activeCategory === cat
                ? { background: accent, color: '#000' }
                : { background: 'transparent', color: fontColor, border: `1px solid ${accent}55` }}>
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Media grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
        {filtered.map((item, i) => (
          <button key={item.id}
            onClick={() => openItem(item, i)}
            className="relative overflow-hidden rounded-xl group cursor-pointer transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-2xl"
            style={{ aspectRatio: '3/4' }}>
            {item.type === 'video' ? (
              item.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.thumbnailUrl} alt={item.caption ?? `Video ${i + 1}`} loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              ) : (
                <video src={item.url} preload="metadata" muted playsInline
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              )
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.url} alt={item.caption ?? `Photo ${i + 1}`} loading="lazy"
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            )}
            {item.type === 'video' && (
              <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm transition-transform duration-300 group-hover:scale-110"
                  style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.35)', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
                  ▶
                </span>
              </span>
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              {item.type !== 'video' && (
                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-semibold">
                  View Album
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* 3D album viewer — photos only */}
      {album && (
        <AlbumViewer photos={album.photos} title={album.title} accent={accent}
          onClose={() => setAlbum(null)} />
      )}

      {/* Video lightbox */}
      {lightbox && (
        <VideoLightbox items={lightbox.items} startIndex={lightbox.index} onClose={() => setLightbox(null)} />
      )}
    </>
  )
}
