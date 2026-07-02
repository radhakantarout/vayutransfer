'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Image from 'next/image'

interface Photo { id: string; url: string; caption?: string; category?: string }

// ── AlbumBook (3D page-flip viewer) ─────────────────────────────────────────

type PageContent =
  | { type: 'cover';  title: string; accent: string }
  | { type: 'photos'; srcs: string[] }
  | { type: 'blank' }

interface Spread { left: PageContent; right: PageContent }

function buildSpreads(photos: Photo[], title: string, accent: string): Spread[] {
  const spreads: Spread[] = []
  // Cover spread
  spreads.push({ left: { type: 'blank' }, right: { type: 'cover', title, accent } })
  // Photo spreads — 2 per spread
  for (let i = 0; i < photos.length; i += 2) {
    spreads.push({
      left:  { type: 'photos', srcs: [photos[i].url] },
      right: photos[i + 1] ? { type: 'photos', srcs: [photos[i + 1].url] } : { type: 'blank' },
    })
  }
  // Back cover
  spreads.push({ left: { type: 'blank' }, right: { type: 'blank' } })
  return spreads
}

function PageSlot({ content, accent }: { content: PageContent; accent: string }) {
  if (content.type === 'blank') return <div className="w-full h-full bg-neutral-900" />
  if (content.type === 'cover') return (
    <div className="w-full h-full flex flex-col items-center justify-center"
      style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}44)` }}>
      <div className="text-4xl mb-4">📷</div>
      <p className="text-white font-bold text-xl text-center px-4">{content.title}</p>
      <p className="text-white/50 text-xs mt-2">Portfolio</p>
    </div>
  )
  return (
    <div className="w-full h-full relative bg-neutral-800">
      {content.srcs[0] && (
        <Image src={content.srcs[0]} alt="Portfolio" fill className="object-cover" sizes="50vw" />
      )}
    </div>
  )
}

function AlbumViewer({ photos, title, accent, onClose }: {
  photos: Photo[]; title: string; accent: string; onClose: () => void
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
        className="absolute top-4 right-4 text-white/60 hover:text-white text-2xl font-light">✕</button>

      <div className="relative w-full max-w-3xl" style={{ perspective: 1200 }}
        onTouchStart={e => { touchX.current = e.touches[0].clientX }}
        onTouchEnd={e => {
          const d = e.changedTouches[0].clientX - touchX.current
          if (d < -50) next(); else if (d > 50) prev()
        }}>
        <div className="flex shadow-2xl" style={{ height: 'min(60vw, 420px)' }}>
          {/* Left page */}
          <div className="flex-1 overflow-hidden border-r border-white/10">
            <PageSlot content={staticLeft} accent={accent} />
          </div>
          {/* Right page */}
          <div className="flex-1 overflow-hidden">
            <PageSlot content={staticRight} accent={accent} />
          </div>
          {/* Flipping page */}
          {flipping && (
            <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d', zIndex: 10 }}>
              <div style={{
                position: 'absolute',
                top: 0, bottom: 0,
                left: isForward ? '50%' : 0,
                width: '50%',
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

      {/* Controls */}
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

// ── Main PortfolioGallery ────────────────────────────────────────────────────

const EXAMPLE_URL = 'https://www.vayustudios.com/studio/examples'

export default function PortfolioGallery({ photos, studioName, accent = '#C9A84C' }: {
  photos: Photo[]; studioName: string; accent?: string
}) {
  const [activeCategory, setActiveCategory] = useState('All')
  const [album, setAlbum] = useState<{ photos: Photo[]; title: string } | null>(null)

  const categories = ['All', ...Array.from(new Set(photos.map(p => p.category ?? 'General').filter(Boolean)))]
  const filtered   = activeCategory === 'All' ? photos : photos.filter(p => (p.category ?? 'General') === activeCategory)

  if (photos.length === 0) {
    return (
      <div className="text-center py-16 px-4">
        <p className="text-white/40 text-sm mb-4">No portfolio photos yet.</p>
        <a href={EXAMPLE_URL} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold border border-white/20 text-white/70 hover:text-white hover:border-white/50 transition-all">
          Browse example galleries →
        </a>
      </div>
    )
  }

  return (
    <>
      {/* Category tabs */}
      {categories.length > 2 && (
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={activeCategory === cat
                ? { background: accent, color: '#000' }
                : { background: 'transparent', color: '#fff', border: `1px solid ${accent}55` }}>
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Photo grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
        {filtered.map((photo, i) => (
          <button key={photo.id} onClick={() => setAlbum({ photos: filtered, title: activeCategory === 'All' ? studioName : activeCategory })}
            className="relative aspect-square overflow-hidden rounded-xl group cursor-pointer">
            <Image src={photo.url} alt={photo.caption ?? `Photo ${i + 1}`} fill
              className="object-cover group-hover:scale-105 transition-transform duration-500" sizes="25vw" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-semibold">
                View Album
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* 3D album viewer */}
      {album && (
        <AlbumViewer photos={album.photos} title={album.title} accent={accent}
          onClose={() => setAlbum(null)} />
      )}
    </>
  )
}
