'use client'

import { useEffect, useState } from 'react'
import { useGalleryData, useGestureNav, DemoBanner, CategoryTabs, TileMedia, VideoPlayBadge, VideoLightbox, type GalleryItem } from './shared'
import { translator } from '@/lib/studio/i18n'
import type { WebsiteLanguage } from '@/types/studio'

const ANGLE_STEP = 18 // degrees between consecutive frames on the shallow cylinder
const ARC_RADIUS = 260

// Frames sit on the inside of a shallow cylinder — same sin/cos ring math as
// Orbit3D, just restricted to a narrow arc instead of a full 360deg circle —
// bordered top/bottom by a CSS-only sprocket-hole strip (repeating radial
// gradient) for the classic 35mm filmstrip look.
function SprocketRow() {
  return (
    <div className="h-3" style={{
      backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.9) 40%, transparent 41%)',
      backgroundSize: '18px 100%',
      backgroundRepeat: 'repeat-x',
      backgroundPosition: 'center',
    }} />
  )
}

export default function FilmReel({ photos, studioName, accent = '#C9A84C', fontColor = '#ffffff', language }: {
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

      <div className="relative mx-auto rounded-xl overflow-hidden select-none touch-none" style={{ maxWidth: 640, background: '#0a0a0a', padding: '14px 0' }} {...gesture}>
        <SprocketRow />
        <div className="relative flex items-center justify-center" style={{ height: 240, perspective: 1400 }}>
          <div className="relative w-full h-full" style={{ transformStyle: 'preserve-3d' }}>
            {filtered.map((item, i) => {
              const offset = i - current
              if (Math.abs(offset) > 4) return null
              const angle = offset * ANGLE_STEP
              const rad = (angle * Math.PI) / 180
              const isCenter = offset === 0
              return (
                <button key={item.id}
                  onClick={() => isCenter ? setLightbox({ items: filtered, index: current }) : setCurrent(i)}
                  className="absolute top-1/2 left-1/2 rounded-sm overflow-hidden border-4 border-black shadow-2xl"
                  style={{
                    width: 170,
                    aspectRatio: '4/3',
                    marginLeft: -85,
                    marginTop: -64,
                    transform: `translateX(${Math.sin(rad) * ARC_RADIUS}px) translateZ(${(Math.cos(rad) - 1) * ARC_RADIUS}px) rotateY(${-angle}deg) scale(${isCenter ? 1 : 0.82})`,
                    opacity: Math.abs(offset) > 3 ? 0 : 1,
                    zIndex: 10 - Math.abs(offset),
                    transition: 'transform 0.45s ease, opacity 0.45s ease',
                  }}>
                  <TileMedia item={item} index={i} />
                  {isCenter && item.type === 'video' && <VideoPlayBadge />}
                </button>
              )
            })}
          </div>
        </div>
        <SprocketRow />
      </div>

      <p className="text-center text-xs opacity-40 mt-4" style={{ color: fontColor }}>{t('galleryScrollNav', 'Scroll or swipe to explore')}</p>

      {lightbox && <VideoLightbox items={lightbox.items} startIndex={lightbox.index} onClose={() => setLightbox(null)} language={language} />}
    </>
  )
}
