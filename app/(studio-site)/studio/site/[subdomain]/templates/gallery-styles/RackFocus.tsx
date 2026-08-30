'use client'

import { useEffect, useState } from 'react'
import { useGalleryData, useGestureNav, DemoBanner, CategoryTabs, TileMedia, VideoPlayBadge, VideoLightbox, type GalleryItem } from './shared'
import { translator } from '@/lib/studio/i18n'
import type { WebsiteLanguage } from '@/types/studio'

// Two overlaid layers cross-blur instead of cross-fading: the outgoing photo
// softens and recedes (blur up, scale up, dim) while the incoming one
// sharpens into focus on top of it (blur down, scale to 1, full opacity) —
// mimicking a camera rack-focus pull between depth planes. Same
// reset-then-rAF `active` trigger as CinemaScreen's Ken Burns effect.
export default function RackFocus({ photos, studioName, accent = '#C9A84C', fontColor = '#ffffff', language }: {
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
  const TRANSITION = 'opacity 0.6s ease, filter 0.6s ease, transform 0.6s ease'

  return (
    <>
      <DemoBanner isDemo={isDemo} accent={accent} language={language} />
      <CategoryTabs categories={categories} activeCategory={activeCategory} setActiveCategory={setActiveCategory} accent={accent} fontColor={fontColor} />

      <div className="mx-auto select-none touch-none" style={{ maxWidth: 380, perspective: 1400 }} {...gesture}>
        <div className="relative rounded-2xl overflow-hidden shadow-2xl bg-black" style={{ aspectRatio: '4/5' }}>
          {prevItem && (
            <div className="absolute inset-0 z-0" style={{
              opacity: active ? 0.3 : 1,
              filter: `blur(${active ? 12 : 0}px)`,
              transform: `scale(${active ? 1.12 : 1})`,
              transition: TRANSITION,
            }}>
              <TileMedia item={prevItem} index={prevIndex ?? 0} />
            </div>
          )}
          <button onClick={() => setLightbox({ items: filtered, index: current })} className="absolute inset-0 z-10 w-full h-full" style={{
            opacity: active ? 1 : 0,
            filter: `blur(${active ? 0 : 12}px)`,
            transform: `scale(${active ? 1 : 0.9})`,
            transition: TRANSITION,
          }}>
            <TileMedia item={item} index={current} />
            {item.type === 'video' && <VideoPlayBadge />}
          </button>
          <div className="pointer-events-none absolute inset-0 z-20" style={{ boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5)' }} />
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
