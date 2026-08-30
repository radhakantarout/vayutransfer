'use client'

import { useEffect, useState } from 'react'
import { useGalleryData, DemoBanner, CategoryTabs, TileMedia, VideoPlayBadge, VideoLightbox, type GalleryItem } from './shared'
import { translator } from '@/lib/studio/i18n'
import type { WebsiteLanguage } from '@/types/studio'

// A tap-through stacked deck (Tinder-card style) — the front card is the
// "current" photo; tapping it sends it to the back of the deck, revealing
// the next. Videos skip the cycling and open the lightbox directly, since
// tapping a video should play it, not just advance the deck.
export default function CardStack({ photos, studioName, accent = '#C9A84C', fontColor = '#ffffff', language }: {
  photos: GalleryItem[]; studioName: string; accent?: string; fontColor?: string; language?: WebsiteLanguage
}) {
  const t = translator(language)
  const { isDemo, categories, activeCategory, setActiveCategory, filtered } = useGalleryData(photos)
  const [order, setOrder] = useState<number[]>([])
  const [lightbox, setLightbox] = useState<{ items: GalleryItem[]; index: number } | null>(null)

  useEffect(() => {
    setOrder(filtered.map((_, i) => i))
  }, [filtered.length, activeCategory])

  const cycle = (item: GalleryItem, idx: number) => {
    if (item.type === 'video') {
      setLightbox({ items: filtered, index: idx })
      return
    }
    setOrder(o => o.length ? [...o.slice(1), o[0]] : o)
  }

  const visible = order.slice(0, 5)

  return (
    <>
      <DemoBanner isDemo={isDemo} accent={accent} language={language} />
      <CategoryTabs categories={categories} activeCategory={activeCategory} setActiveCategory={setActiveCategory} accent={accent} fontColor={fontColor} />
      <div className="flex justify-center py-4">
        <div className="relative" style={{ width: 'min(85vw, 320px)', aspectRatio: '3/4' }}>
          {visible.slice().reverse().map((idx, stackPos) => {
            const item = filtered[idx]
            if (!item) return null
            const depthFromFront = visible.length - 1 - stackPos
            const tilt = depthFromFront === 0 ? 0 : (stackPos % 2 === 0 ? -1 : 1) * depthFromFront * 2.5
            return (
              <button key={item.id} onClick={() => cycle(item, idx)}
                className="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl transition-all duration-500 ease-out group"
                style={{
                  transform: `translateY(${depthFromFront * 10}px) scale(${1 - depthFromFront * 0.045}) rotate(${tilt}deg)`,
                  zIndex: 10 - depthFromFront,
                  opacity: depthFromFront > 3 ? 0 : 1,
                }}>
                <TileMedia item={item} index={idx} />
                {item.type === 'video' && depthFromFront === 0 && <VideoPlayBadge />}
              </button>
            )
          })}
        </div>
      </div>
      <p className="text-center text-xs opacity-50 mt-2" style={{ color: fontColor }}>{t('galleryTapAdvance', 'Tap the photo to see the next one')}</p>
      {lightbox && <VideoLightbox items={lightbox.items} startIndex={lightbox.index} onClose={() => setLightbox(null)} language={language} />}
    </>
  )
}
