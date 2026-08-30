'use client'

import { useEffect, useState } from 'react'
import { useGalleryData, useGestureNav, DemoBanner, CategoryTabs, TileMedia, VideoPlayBadge, VideoLightbox, type GalleryItem } from './shared'
import { translator } from '@/lib/studio/i18n'
import type { WebsiteLanguage } from '@/types/studio'

// A widescreen "movie screen" tilted back slightly (rotateX, like sitting in
// a theater), letterbox bars + vignette, and a slow Ken-Burns zoom on the
// current photo. `active` toggles false->true (via the same reset-then-rAF
// trick already used for Cube3D's flip) whenever `current` changes, driving
// both the crossfade (0.7s) and the zoom (6s) off one piece of state.
export default function CinemaScreen({ photos, studioName, accent = '#C9A84C', fontColor = '#ffffff', language }: {
  photos: GalleryItem[]; studioName: string; accent?: string; fontColor?: string; language?: WebsiteLanguage
}) {
  const t = translator(language)
  const { isDemo, categories, activeCategory, setActiveCategory, filtered } = useGalleryData(photos)
  const [current, setCurrent] = useState(0)
  const [prevIndex, setPrevIndex] = useState<number | null>(null)
  const [active, setActive] = useState(true)
  const [lightbox, setLightbox] = useState<{ items: GalleryItem[]; index: number } | null>(null)

  useEffect(() => { setCurrent(0); setPrevIndex(null) }, [activeCategory])

  useEffect(() => {
    setActive(false)
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setActive(true)))
    return () => cancelAnimationFrame(id)
  }, [current])

  const step = (dir: 1 | -1) => {
    const next = Math.max(0, Math.min(filtered.length - 1, current + dir))
    if (next === current) return
    setPrevIndex(current)
    setCurrent(next)
  }
  const gesture = useGestureNav(filtered.length, step)

  const item = filtered[current]
  if (!item) return null
  const prevItem = prevIndex !== null ? filtered[prevIndex] : null

  return (
    <>
      <DemoBanner isDemo={isDemo} accent={accent} language={language} />
      <CategoryTabs categories={categories} activeCategory={activeCategory} setActiveCategory={setActiveCategory} accent={accent} fontColor={fontColor} />

      <div className="mx-auto select-none touch-none" style={{ maxWidth: 640, perspective: 1600 }} {...gesture}>
        <div className="relative rounded-2xl overflow-hidden shadow-2xl"
          style={{ aspectRatio: '16/9', background: '#000', border: '10px solid #111', transform: 'rotateX(4deg)', transformStyle: 'preserve-3d' }}>
          {/* letterbox bars */}
          <div className="absolute top-0 left-0 right-0 h-[6%] bg-black z-20" />
          <div className="absolute bottom-0 left-0 right-0 h-[6%] bg-black z-20" />

          <button onClick={() => setLightbox({ items: filtered, index: current })} className="absolute inset-0 w-full h-full">
            {prevItem && (
              <div className="absolute inset-0" style={{ opacity: active ? 0 : 1, transition: 'opacity 0.7s ease' }}>
                <TileMedia item={prevItem} index={prevIndex ?? 0} />
              </div>
            )}
            <div className="absolute inset-0" style={{
              opacity: active ? 1 : 0,
              transform: `scale(${active ? 1.06 : 1})`,
              transition: 'opacity 0.7s ease, transform 6s ease-out',
            }}>
              <TileMedia item={item} index={current} />
            </div>
            {item.type === 'video' && <VideoPlayBadge />}
          </button>

          {/* vignette */}
          <div className="pointer-events-none absolute inset-0 z-10" style={{ background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.6) 100%)' }} />
        </div>
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
    </>
  )
}
