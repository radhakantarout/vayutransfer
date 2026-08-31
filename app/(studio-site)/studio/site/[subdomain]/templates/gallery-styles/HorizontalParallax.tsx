'use client'

import { useState } from 'react'
import { useGalleryData, useGestureNav, useAutoPlay, useBouncingAutoStep, DemoBanner, CategoryTabs, TileMedia, VideoPlayBadge, VideoLightbox, type GalleryItem } from './shared'
import { translator } from '@/lib/studio/i18n'
import type { WebsiteLanguage } from '@/types/studio'

// Same starting visual as Coverflow (large center item, receding side items)
// but tiles follow the live drag/touch position in real time instead of only
// snapping on click — `dragOffset` comes from useGestureNav's onDragMove and
// is nudged into each tile's transform while dragging; the CSS transition is
// switched off during the drag itself (so the follow feels 1:1, not laggy)
// and switched back on for the release-triggered settle/snap. Off-center
// tiles also get a distance-scaled blur for a stronger depth-of-field look.
export default function HorizontalParallax({ photos, studioName, accent = '#C9A84C', fontColor = '#ffffff', language }: {
  photos: GalleryItem[]; studioName: string; accent?: string; fontColor?: string; language?: WebsiteLanguage
}) {
  const t = translator(language)
  const { isDemo, categories, activeCategory, setActiveCategory, filtered } = useGalleryData(photos)
  const [current, setCurrent] = useState(0)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [lightbox, setLightbox] = useState<{ items: GalleryItem[]; index: number } | null>(null)

  const step = (dir: 1 | -1) => setCurrent(c => Math.max(0, Math.min(filtered.length - 1, c + dir)))
  const gesture = useGestureNav(filtered.length, step, dx => setDragOffset(dx))
  const autoAdvance = useBouncingAutoStep(filtered.length, current, step)
  const autoplay = useAutoPlay(filtered.length, autoAdvance)

  const handlers = {
    ...gesture,
    onPointerDown: (e: React.PointerEvent) => { setIsDragging(true); gesture.onPointerDown(e) },
    onPointerUp:   (e: React.PointerEvent) => { setIsDragging(false); gesture.onPointerUp(e) },
    onPointerLeave: () => { setIsDragging(false); gesture.onPointerLeave() },
    onTouchStart: (e: React.TouchEvent) => { setIsDragging(true); gesture.onTouchStart(e) },
    onTouchEnd:   (e: React.TouchEvent) => { setIsDragging(false); gesture.onTouchEnd(e) },
  }

  return (
    <div {...autoplay}>
      <DemoBanner isDemo={isDemo} accent={accent} language={language} />
      <CategoryTabs categories={categories} activeCategory={activeCategory} setActiveCategory={setActiveCategory} accent={accent} fontColor={fontColor} />

      <div className="relative flex items-center justify-center overflow-hidden select-none touch-none" style={{ height: 340, perspective: 1300 }} {...handlers}>
        {filtered.map((item, i) => {
          const offset = i - current
          if (Math.abs(offset) > 4) return null
          const isCenter = offset === 0
          const follow = Math.abs(offset) <= 1 ? dragOffset * 0.6 : dragOffset * 0.15
          return (
            <button key={item.id}
              onClick={() => isCenter ? setLightbox({ items: filtered, index: current }) : setCurrent(i)}
              className="absolute rounded-xl overflow-hidden shadow-2xl"
              style={{
                width: 200,
                aspectRatio: '3/4',
                transform: `translateX(${offset * 150 + follow}px) translateZ(${isCenter ? 0 : -130}px) rotateY(${offset * -24}deg) scale(${isCenter ? 1 : 0.8})`,
                filter: isCenter ? 'none' : `blur(${Math.min(6, Math.abs(offset) * 2)}px)`,
                opacity: Math.abs(offset) > 3 ? 0.2 : 1,
                zIndex: 10 - Math.abs(offset),
                transition: isDragging ? 'none' : 'transform 0.35s ease, opacity 0.35s ease, filter 0.35s ease',
              }}>
              <TileMedia item={item} index={i} />
              {isCenter && item.type === 'video' && <VideoPlayBadge />}
            </button>
          )
        })}
      </div>

      <p className="text-center text-xs opacity-40 mt-4" style={{ color: fontColor }}>{t('galleryScrollNav', 'Scroll or swipe to explore')}</p>

      {lightbox && <VideoLightbox items={lightbox.items} startIndex={lightbox.index} onClose={() => setLightbox(null)} language={language} />}
    </div>
  )
}
