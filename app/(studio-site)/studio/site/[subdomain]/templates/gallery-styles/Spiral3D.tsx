'use client'

import { useEffect, useState } from 'react'
import { useGalleryData, useGestureNav, DemoBanner, CategoryTabs, TileMedia, VideoPlayBadge, VideoLightbox, type GalleryItem } from './shared'
import { translator } from '@/lib/studio/i18n'
import type { WebsiteLanguage } from '@/types/studio'

const ANGLE_STEP = 46 // degrees of helix rotation between consecutive items
const RADIUS = 130
const STEP_Y = 92 // vertical distance between consecutive items along the helix

// Each item's own transform places it at a fixed point on a helix
// (translateY(i*STEP_Y) + translateX/Z from cos/sin(i*ANGLE_STEP)) — the
// group wrapper then shifts everything by -current*STEP_Y, so item `current`
// always lands at vertical center. This is a bounded linear spiral (not a
// closed ring like Orbit3D), so stepping clamps at the first/last item
// instead of wrapping.
export default function Spiral3D({ photos, studioName, accent = '#C9A84C', fontColor = '#ffffff', language }: {
  photos: GalleryItem[]; studioName: string; accent?: string; fontColor?: string; language?: WebsiteLanguage
}) {
  const t = translator(language)
  const { isDemo, categories, activeCategory, setActiveCategory, filtered } = useGalleryData(photos)
  const [current, setCurrent] = useState(0)
  const [lightbox, setLightbox] = useState<{ items: GalleryItem[]; index: number } | null>(null)

  useEffect(() => setCurrent(0), [activeCategory])

  const step = (dir: 1 | -1) => setCurrent(c => Math.max(0, Math.min(filtered.length - 1, c + dir)))
  const gesture = useGestureNav(filtered.length, step)

  return (
    <>
      <DemoBanner isDemo={isDemo} accent={accent} language={language} />
      <CategoryTabs categories={categories} activeCategory={activeCategory} setActiveCategory={setActiveCategory} accent={accent} fontColor={fontColor} />

      <div className="relative mx-auto overflow-hidden select-none touch-none" style={{ height: 420, perspective: 1500 }} {...gesture}>
        <div className="absolute left-1/2 top-1/2 w-full h-full" style={{
          transformStyle: 'preserve-3d',
          transform: `translate(-50%, -50%) translateY(${-current * STEP_Y}px)`,
          transition: 'transform 0.5s ease',
        }}>
          {filtered.map((item, i) => {
            const angle = i * ANGLE_STEP
            const rad = (angle * Math.PI) / 180
            const dist = Math.abs(i - current)
            const isFocus = i === current
            return (
              <button key={item.id}
                onClick={() => isFocus ? setLightbox({ items: filtered, index: current }) : setCurrent(i)}
                className="absolute rounded-xl overflow-hidden shadow-2xl"
                style={{
                  width: 130,
                  aspectRatio: '3/4',
                  left: '50%',
                  top: '50%',
                  marginLeft: -65,
                  marginTop: -87,
                  transform: `translateY(${i * STEP_Y}px) translateX(${RADIUS * Math.cos(rad)}px) translateZ(${RADIUS * Math.sin(rad)}px) rotateY(${-angle}deg) scale(${isFocus ? 1.15 : 0.85})`,
                  opacity: dist > 4 ? 0 : 1 - dist * 0.16,
                  zIndex: 100 - dist,
                  pointerEvents: dist > 4 ? 'none' : 'auto',
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
