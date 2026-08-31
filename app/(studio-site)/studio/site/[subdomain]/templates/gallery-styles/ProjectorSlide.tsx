'use client'

import { useEffect, useState } from 'react'
import { useGalleryData, useGestureNav, useAutoPlay, useBouncingAutoStep, DemoBanner, CategoryTabs, TileMedia, VideoPlayBadge, VideoLightbox, type GalleryItem } from './shared'
import { translator } from '@/lib/studio/i18n'
import type { WebsiteLanguage } from '@/types/studio'

// A classic 35mm-slide-mount frame (thick cardboard-colored border). The
// outgoing slide drops away and tilts back (rotateX) while the incoming one
// drops down from above and tilts into place, like a slide clicking into a
// projector gate — two independently-animating layers (simpler than a single
// two-sided rotating panel, since the mount frame itself never turns). A
// brief white flash on the cut plus a soft projector light-cone (Tailwind's
// animate-pulse) behind the frame complete the look.
export default function ProjectorSlide({ photos, studioName, accent = '#C9A84C', fontColor = '#ffffff', language }: {
  photos: GalleryItem[]; studioName: string; accent?: string; fontColor?: string; language?: WebsiteLanguage
}) {
  const t = translator(language)
  const { isDemo, categories, activeCategory, setActiveCategory, filtered } = useGalleryData(photos)
  const [current, setCurrent] = useState(0)
  const [prevIndex, setPrevIndex] = useState<number | null>(null)
  const [active, setActive] = useState(true)
  const [flash, setFlash] = useState(false)
  const [lightbox, setLightbox] = useState<{ items: GalleryItem[]; index: number } | null>(null)

  useEffect(() => { setCurrent(0); setPrevIndex(null) }, [activeCategory])

  useEffect(() => {
    setActive(false)
    setFlash(true)
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setActive(true)))
    const flashTimer = setTimeout(() => setFlash(false), 200)
    return () => { cancelAnimationFrame(raf); clearTimeout(flashTimer) }
  }, [current])

  const step = (dir: 1 | -1) => {
    const next = Math.max(0, Math.min(filtered.length - 1, current + dir))
    if (next === current) return
    setPrevIndex(current)
    setCurrent(next)
  }
  const gesture = useGestureNav(filtered.length, step)
  const autoAdvance = useBouncingAutoStep(filtered.length, current, step)
  const autoplay = useAutoPlay(filtered.length, autoAdvance)

  const item = filtered[current]
  if (!item) return null
  const prevItem = prevIndex !== null ? filtered[prevIndex] : null

  return (
    <div {...autoplay}>
      <DemoBanner isDemo={isDemo} accent={accent} language={language} />
      <CategoryTabs categories={categories} activeCategory={activeCategory} setActiveCategory={setActiveCategory} accent={accent} fontColor={fontColor} />

      <div className="relative mx-auto flex items-center justify-center rounded-2xl overflow-hidden select-none touch-none"
        style={{ maxWidth: 420, height: 380, background: 'radial-gradient(ellipse at center, #1a1a1a 0%, #000 75%)', perspective: 1200 }} {...gesture}>
        <div className="pointer-events-none absolute inset-0 animate-pulse" style={{ background: 'radial-gradient(ellipse 260px 260px at 50% 45%, rgba(255,244,214,0.16), transparent 70%)' }} />

        <div className="relative" style={{ width: 260, aspectRatio: '4/3', transformStyle: 'preserve-3d' }}>
          {prevItem && (
            <div className="absolute inset-0 rounded-sm overflow-hidden shadow-2xl" style={{
              border: '14px solid #e9dcc2',
              boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.15)',
              transform: active ? 'translateY(46px) rotateX(28deg)' : 'translateY(0) rotateX(0deg)',
              opacity: active ? 0 : 1,
              transition: 'transform 0.4s ease-in, opacity 0.4s ease-in',
            }}>
              <TileMedia item={prevItem} index={prevIndex ?? 0} />
            </div>
          )}
          <button onClick={() => setLightbox({ items: filtered, index: current })}
            className="absolute inset-0 rounded-sm overflow-hidden shadow-2xl w-full h-full" style={{
              border: '14px solid #e9dcc2',
              boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.15)',
              transform: active ? 'translateY(0) rotateX(0deg)' : 'translateY(-56px) rotateX(-28deg)',
              opacity: active ? 1 : 0,
              transition: 'transform 0.45s ease-out, opacity 0.45s ease-out',
            }}>
            <TileMedia item={item} index={current} />
            {item.type === 'video' && <VideoPlayBadge />}
          </button>
        </div>

        <div className="pointer-events-none absolute inset-0 bg-white" style={{ opacity: flash ? 0.35 : 0, transition: 'opacity 0.2s ease-out' }} />
      </div>

      {filtered.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-5">
          {filtered.map((_, i) => (
            <button key={i} onClick={() => { if (i !== current) { setPrevIndex(current); setCurrent(i) } }}
              className="h-1.5 rounded-full transition-all"
              style={{ width: i === current ? 18 : 6, background: i === current ? accent : `${fontColor}33` }} />
          ))}
        </div>
      )}
      <p className="text-center text-xs opacity-40 mt-3" style={{ color: fontColor }}>{t('galleryScrollNav', 'Scroll or swipe to explore')}</p>

      {lightbox && <VideoLightbox items={lightbox.items} startIndex={lightbox.index} onClose={() => setLightbox(null)} language={language} />}
    </div>
  )
}
