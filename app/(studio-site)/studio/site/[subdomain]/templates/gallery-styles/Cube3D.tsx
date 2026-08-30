'use client'

import { useEffect, useState } from 'react'
import { useGalleryData, useGestureNav, DemoBanner, CategoryTabs, TileMedia, VideoPlayBadge, VideoLightbox, type GalleryItem } from './shared'
import { translator } from '@/lib/studio/i18n'
import type { WebsiteLanguage } from '@/types/studio'

// One large photo "face" at a time — stepping rotates the outgoing face away
// while the incoming face turns in, using the exact single-rotating-panel
// trick already proven in PortfolioGallery.tsx's AlbumViewer (both faces live
// inside one container; the back face is pre-rotated 180deg via
// backfaceVisibility so it appears right-side-up once the sweep passes 90deg).
export default function Cube3D({ photos, studioName, accent = '#C9A84C', fontColor = '#ffffff', language }: {
  photos: GalleryItem[]; studioName: string; accent?: string; fontColor?: string; language?: WebsiteLanguage
}) {
  const t = translator(language)
  const { isDemo, categories, activeCategory, setActiveCategory, filtered } = useGalleryData(photos)
  const [current, setCurrent] = useState(0)
  const [pendingIdx, setPendingIdx] = useState(0)
  const [direction, setDirection] = useState<1 | -1 | null>(null)
  const [angle, setAngle] = useState(0)
  const [flipping, setFlipping] = useState(false)
  const [lightbox, setLightbox] = useState<{ items: GalleryItem[]; index: number } | null>(null)

  useEffect(() => setCurrent(0), [activeCategory])

  const wrap = (i: number) => filtered.length ? ((i % filtered.length) + filtered.length) % filtered.length : 0

  const step = (dir: 1 | -1) => {
    if (flipping || filtered.length <= 1) return
    setPendingIdx(wrap(current + dir))
    setDirection(dir)
    setFlipping(true)
    setAngle(0)
    requestAnimationFrame(() => requestAnimationFrame(() => setAngle(dir === 1 ? -180 : 180)))
  }

  const onFlipDone = () => { setCurrent(pendingIdx); setFlipping(false); setAngle(0) }

  const gesture = useGestureNav(filtered.length, step)

  const item = filtered[current]
  const pend = filtered[pendingIdx] ?? item
  if (!item) return null

  return (
    <>
      <DemoBanner isDemo={isDemo} accent={accent} language={language} />
      <CategoryTabs categories={categories} activeCategory={activeCategory} setActiveCategory={setActiveCategory} accent={accent} fontColor={fontColor} />

      <div className="mx-auto select-none touch-none" style={{ maxWidth: 420, perspective: 1400 }} {...gesture}>
        <div className="relative w-full" style={{ aspectRatio: '3/4' }}>
          {!flipping ? (
            <button onClick={() => setLightbox({ items: filtered, index: current })}
              className="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl group">
              <TileMedia item={item} index={current} />
              {item.type === 'video' && <VideoPlayBadge />}
            </button>
          ) : (
            <div className="absolute inset-0" style={{
              transformStyle: 'preserve-3d',
              transformOrigin: direction === 1 ? 'left center' : 'right center',
              transform: `rotateY(${angle}deg)`,
              transition: 'transform 0.55s ease-in-out',
            }} onTransitionEnd={onFlipDone}>
              <div className="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl" style={{ backfaceVisibility: 'hidden' }}>
                <TileMedia item={item} index={current} />
              </div>
              <div className="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl"
                style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                <TileMedia item={pend} index={pendingIdx} />
              </div>
            </div>
          )}
        </div>
      </div>

      {filtered.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-5">
          {filtered.map((_, i) => (
            <button key={i} onClick={() => !flipping && setCurrent(i)}
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
