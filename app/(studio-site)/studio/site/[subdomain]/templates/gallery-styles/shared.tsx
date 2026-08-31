'use client'

import { useEffect, useRef, useState } from 'react'
import { DEMO_PHOTOS, type GalleryItem } from '../PortfolioGallery'
import { translator } from '@/lib/studio/i18n'
import type { WebsiteLanguage } from '@/types/studio'

export type { GalleryItem }
export { VideoLightbox } from '../PortfolioGallery'

// Shared demo-fallback + category-filter state every gallery style needs —
// extracted so each style component (RotateScroll, CardStack, Coverflow,
// ParallaxMasonry) only has to implement its own actual presentation, not
// re-derive "what should the grid show" from scratch each time.
export function useGalleryData(photos: GalleryItem[]) {
  const isDemo = photos.length === 0
  const displayPhotos = isDemo ? DEMO_PHOTOS : photos
  const [activeCategory, setActiveCategory] = useState('All')
  const categories = ['All', ...Array.from(new Set(displayPhotos.map(p => p.category ?? 'General').filter(Boolean)))]
  const filtered = activeCategory === 'All' ? displayPhotos : displayPhotos.filter(p => (p.category ?? 'General') === activeCategory)
  return { isDemo, displayPhotos, categories, activeCategory, setActiveCategory, filtered }
}

export function DemoBanner({ isDemo, accent, language }: { isDemo: boolean; accent: string; language?: WebsiteLanguage }) {
  if (!isDemo) return null
  const t = translator(language)
  return (
    <div className="mb-6 px-4 py-3 rounded-xl text-center text-xs"
      style={{ background: `${accent}18`, border: `1px solid ${accent}33`, color: `${accent}cc` }}>
      {t('galleryDemoNotice', 'These are sample photos. Log in to your dashboard → Website → Gallery to upload your real portfolio.')}
    </div>
  )
}

export function CategoryTabs({
  categories, activeCategory, setActiveCategory, accent, fontColor,
}: {
  categories: string[]
  activeCategory: string
  setActiveCategory: (c: string) => void
  accent: string
  fontColor: string
}) {
  if (categories.length <= 2) return null
  return (
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
  )
}

// Video tiles get the same poster + play-badge treatment in every style —
// shared so the visual language stays consistent regardless of presentation.
export function VideoPlayBadge() {
  return (
    <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <span className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm transition-transform duration-300 group-hover:scale-110"
        style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.35)', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
        ▶
      </span>
    </span>
  )
}

// Unifies wheel, touch-swipe, and mouse-drag input into onStep(1)/onStep(-1)
// calls for the 3D gallery styles (Cube3D, Orbit3D, Spiral3D,
// HorizontalParallax) — every style responds to the same gesture vocabulary
// (vertical scroll, horizontal scroll, swipe, drag) regardless of which
// single axis its own visual metaphor suggests. preventDefault only fires on
// wheel events while the pointer is over the gallery box, so the page itself
// is never scroll-jacked — normal scrolling resumes the instant the cursor
// leaves it. `onDragMove` is optional live delta feedback (dx, dy since the
// gesture started) for styles like HorizontalParallax that visually follow
// the pointer during the drag instead of only snapping on release.
export function useGestureNav(count: number, onStep: (dir: 1 | -1) => void, onDragMove?: (dx: number, dy: number) => void) {
  const wheelAccum = useRef(0)
  const wheelCooldown = useRef(false)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const STEP_THRESHOLD = 40
  const WHEEL_COOLDOWN_MS = 450

  const onWheel = (e: React.WheelEvent) => {
    if (count <= 1) return
    e.preventDefault()
    if (wheelCooldown.current) return
    wheelAccum.current += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX
    if (Math.abs(wheelAccum.current) > STEP_THRESHOLD) {
      onStep(wheelAccum.current > 0 ? 1 : -1)
      wheelAccum.current = 0
      wheelCooldown.current = true
      setTimeout(() => { wheelCooldown.current = false }, WHEEL_COOLDOWN_MS)
    }
  }

  const startDrag = (x: number, y: number) => { dragStart.current = { x, y } }
  const moveDrag = (x: number, y: number) => {
    if (!dragStart.current) return
    onDragMove?.(x - dragStart.current.x, y - dragStart.current.y)
  }
  const endDrag = (x: number, y: number) => {
    if (!dragStart.current || count <= 1) { dragStart.current = null; return }
    const dx = x - dragStart.current.x
    const dy = y - dragStart.current.y
    dragStart.current = null
    onDragMove?.(0, 0)
    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) > STEP_THRESHOLD) onStep(dx < 0 ? 1 : -1)
    } else {
      if (Math.abs(dy) > STEP_THRESHOLD) onStep(dy < 0 ? 1 : -1)
    }
  }

  return {
    onWheel,
    onPointerDown: (e: React.PointerEvent) => startDrag(e.clientX, e.clientY),
    onPointerMove: (e: React.PointerEvent) => moveDrag(e.clientX, e.clientY),
    onPointerUp:   (e: React.PointerEvent) => endDrag(e.clientX, e.clientY),
    onPointerLeave: () => { if (dragStart.current) { dragStart.current = null; onDragMove?.(0, 0) } },
    onTouchStart: (e: React.TouchEvent) => startDrag(e.touches[0].clientX, e.touches[0].clientY),
    onTouchMove:  (e: React.TouchEvent) => moveDrag(e.touches[0].clientX, e.touches[0].clientY),
    onTouchEnd:   (e: React.TouchEvent) => endDrag(e.changedTouches[0].clientX, e.changedTouches[0].clientY),
  }
}

// Auto-advances a carousel-style gallery so it feels alive to a visitor who
// hasn't touched it yet — calls `advance()` every `intervalMs`, and stops
// permanently (never resumes this mount) the moment the visitor interacts:
// a click, a touch, or a wheel/scroll anywhere inside the gallery's rendered
// area. Returns capture-phase handlers meant to be spread onto the style's
// OUTERMOST wrapping element (not just the 3D box) so a tap on a dot, a
// rotate button, or a category tab counts as "taking over" too, not just a
// drag/swipe on the photos themselves. Capture-phase + no preventDefault/
// stopPropagation means normal clicks/drags still work exactly as before;
// this only ever flips one bit of state on the way past.
export function useAutoPlay(count: number, advance: () => void, intervalMs = 3200) {
  const [paused, setPaused] = useState(false)
  const advanceRef = useRef(advance)
  advanceRef.current = advance

  useEffect(() => {
    if (paused || count <= 1) return
    const id = setInterval(() => advanceRef.current(), intervalMs)
    return () => clearInterval(id)
  }, [paused, count, intervalMs])

  const stop = () => setPaused(true)
  return { onPointerDownCapture: stop, onTouchStartCapture: stop, onWheelCapture: stop }
}

// Turns a bounded `step(dir)` (one that clamps at [0, count-1], as every
// non-ring carousel style already has for its manual prev/next) into a
// ping-pong advance callback for useAutoPlay — reverses direction once a
// step would hit either end, instead of jump-cutting back to the first
// photo. Needs `current` to know when it's at a boundary; read through a
// ref so the returned callback never goes stale between renders.
export function useBouncingAutoStep(count: number, current: number, step: (dir: 1 | -1) => void) {
  const dirRef = useRef<1 | -1>(1)
  const currentRef = useRef(current)
  currentRef.current = current
  const stepRef = useRef(step)
  stepRef.current = step

  return () => {
    let dir = dirRef.current
    if (currentRef.current >= count - 1) dir = -1
    else if (currentRef.current <= 0) dir = 1
    dirRef.current = dir
    stepRef.current(dir)
  }
}

export function TileMedia({ item, index }: { item: GalleryItem; index: number }) {
  if (item.type === 'video') {
    return item.thumbnailUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={item.thumbnailUrl} alt={item.caption ?? `Video ${index + 1}`} loading="lazy"
        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
    ) : (
      <video src={item.url} preload="metadata" muted playsInline
        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.url} alt={item.caption ?? `Photo ${index + 1}`} loading="lazy"
      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
  )
}
