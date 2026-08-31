'use client'

import { useEffect, useState } from 'react'
import { useGalleryData, useGestureNav, useAutoPlay, useBouncingAutoStep, DemoBanner, CategoryTabs, TileMedia, VideoPlayBadge, VideoLightbox, type GalleryItem } from './shared'
import { translator } from '@/lib/studio/i18n'
import type { WebsiteLanguage } from '@/types/studio'

// Same per-offset 3D recession as Coverflow, staged on a dark backdrop with a
// radial "spotlight" light-cone (Tailwind's animate-pulse for a subtle
// flicker, no custom keyframes) centered on the focused photo — side photos
// sit dimmed in the "wings" via a brightness filter instead of Coverflow's
// full-brightness side tiles.
export default function SpotlightStage({ photos, studioName, accent = '#C9A84C', fontColor = '#ffffff', language }: {
  photos: GalleryItem[]; studioName: string; accent?: string; fontColor?: string; language?: WebsiteLanguage
}) {
  const t = translator(language)
  const { isDemo, categories, activeCategory, setActiveCategory, filtered } = useGalleryData(photos)
  const [current, setCurrent] = useState(0)
  const [lightbox, setLightbox] = useState<{ items: GalleryItem[]; index: number } | null>(null)

  useEffect(() => setCurrent(0), [activeCategory])

  const step = (dir: 1 | -1) => setCurrent(c => Math.max(0, Math.min(filtered.length - 1, c + dir)))
  const gesture = useGestureNav(filtered.length, step)
  const autoAdvance = useBouncingAutoStep(filtered.length, current, step)
  const autoplay = useAutoPlay(filtered.length, autoAdvance)

  return (
    <div {...autoplay}>
      <DemoBanner isDemo={isDemo} accent={accent} language={language} />
      <CategoryTabs categories={categories} activeCategory={activeCategory} setActiveCategory={setActiveCategory} accent={accent} fontColor={fontColor} />

      <div className="relative rounded-2xl overflow-hidden select-none touch-none"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, #1c1c1c 0%, #000 70%)' }} {...gesture}>
        {/* light cone */}
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 animate-pulse"
          style={{ width: 420, height: 460, background: 'radial-gradient(ellipse 220px 460px at 50% 0%, rgba(255,248,220,0.22), transparent 72%)' }} />

        <div className="relative flex items-center justify-center overflow-hidden" style={{ height: 340, perspective: 1200 }}>
          {filtered.map((item, i) => {
            const offset = i - current
            if (Math.abs(offset) > 3) return null
            const isCenter = offset === 0
            return (
              <button key={item.id}
                onClick={() => isCenter ? setLightbox({ items: filtered, index: current }) : setCurrent(i)}
                className="absolute rounded-xl overflow-hidden shadow-2xl"
                style={{
                  width: 190,
                  aspectRatio: '3/4',
                  transform: `translateX(${offset * 120}px) translateZ(${isCenter ? 0 : -110}px) rotateY(${offset * -32}deg) scale(${isCenter ? 1 : 0.85})`,
                  filter: isCenter ? 'none' : 'brightness(0.35) saturate(0.7)',
                  zIndex: 10 - Math.abs(offset),
                  opacity: Math.abs(offset) > 2 ? 0.15 : 1,
                  transition: 'transform 0.4s ease-out, filter 0.4s ease-out, opacity 0.4s ease-out',
                }}>
                <TileMedia item={item} index={i} />
                {isCenter && item.type === 'video' && <VideoPlayBadge />}
              </button>
            )
          })}
        </div>
      </div>

      <p className="text-center text-xs opacity-40 mt-4" style={{ color: fontColor }}>{t('galleryScrollNav', 'Scroll or swipe to explore')}</p>

      {lightbox && <VideoLightbox items={lightbox.items} startIndex={lightbox.index} onClose={() => setLightbox(null)} language={language} />}
    </div>
  )
}
