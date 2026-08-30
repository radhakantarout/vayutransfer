'use client'

import { useEffect, useState } from 'react'
import { useGalleryData, useGestureNav, DemoBanner, CategoryTabs, TileMedia, VideoPlayBadge, VideoLightbox, type GalleryItem } from './shared'
import { translator } from '@/lib/studio/i18n'
import type { WebsiteLanguage } from '@/types/studio'

const RADIUS = 250

// All filtered items sit on a closed 360deg ring (rotateY(angle) translateZ(radius)
// per item, angle relative to `current`) — extends Coverflow's per-offset
// transform math but wraps it into a circle so there's no "ran out of items"
// edge at either side. Scroll/swipe/drag rotates the ring by one item at a
// time (via useGestureNav); clicking a side item brings it to center the same
// way Coverflow does, and clicking the centered item opens the lightbox.
export default function Orbit3D({ photos, studioName, accent = '#C9A84C', fontColor = '#ffffff', language }: {
  photos: GalleryItem[]; studioName: string; accent?: string; fontColor?: string; language?: WebsiteLanguage
}) {
  const t = translator(language)
  const { isDemo, categories, activeCategory, setActiveCategory, filtered } = useGalleryData(photos)
  const [current, setCurrent] = useState(0)
  const [lightbox, setLightbox] = useState<{ items: GalleryItem[]; index: number } | null>(null)

  useEffect(() => setCurrent(0), [activeCategory])

  const wrap = (i: number) => filtered.length ? ((i % filtered.length) + filtered.length) % filtered.length : 0
  const step = (dir: 1 | -1) => setCurrent(c => wrap(c + dir))
  const gesture = useGestureNav(filtered.length, step)

  return (
    <>
      <DemoBanner isDemo={isDemo} accent={accent} language={language} />
      <CategoryTabs categories={categories} activeCategory={activeCategory} setActiveCategory={setActiveCategory} accent={accent} fontColor={fontColor} />

      <div className="relative mx-auto select-none touch-none" style={{ height: 340, perspective: 1400 }} {...gesture}>
        <div className="relative w-full h-full" style={{ transformStyle: 'preserve-3d' }}>
          {filtered.map((item, i) => {
            const angle = ((i - current) / filtered.length) * 360
            const rad = (angle * Math.PI) / 180
            const isFocus = i === current
            const depth = Math.cos(rad)
            return (
              <button key={item.id}
                onClick={() => isFocus ? setLightbox({ items: filtered, index: current }) : setCurrent(i)}
                className="absolute rounded-xl overflow-hidden shadow-2xl group"
                style={{
                  width: 160,
                  aspectRatio: '3/4',
                  left: '50%',
                  top: '50%',
                  marginLeft: -80,
                  marginTop: -107,
                  transform: `rotateY(${angle}deg) translateZ(${RADIUS}px) scale(${isFocus ? 1 : 0.72})`,
                  opacity: depth > -0.4 ? 1 : 0.15,
                  zIndex: Math.round(100 * depth),
                  transition: 'transform 0.5s ease, opacity 0.5s ease',
                }}>
                <TileMedia item={item} index={i} />
                {isFocus && item.type === 'video' && <VideoPlayBadge />}
              </button>
            )
          })}
        </div>
      </div>

      <p className="text-center text-xs opacity-40 mt-4" style={{ color: fontColor }}>{t('galleryScrollNav', 'Scroll or swipe to explore')}</p>

      {lightbox && <VideoLightbox items={lightbox.items} startIndex={lightbox.index} onClose={() => setLightbox(null)} language={language} />}
    </>
  )
}
