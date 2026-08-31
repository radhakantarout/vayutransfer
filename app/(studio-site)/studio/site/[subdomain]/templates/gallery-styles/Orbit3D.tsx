'use client'

import { useEffect, useState } from 'react'
import { useGalleryData, useGestureNav, useAutoPlay, DemoBanner, CategoryTabs, TileMedia, VideoPlayBadge, VideoLightbox, type GalleryItem } from './shared'
import { translator } from '@/lib/studio/i18n'
import type { WebsiteLanguage } from '@/types/studio'

const RADIUS = 235
const ANGLE_STEP = 36 // fixed degrees between adjacent slots — independent of total
                       // photo count, so spacing (and the no-overlap guarantee below)
                       // never gets tighter just because a studio uploaded more photos
const CARD_W = 150
const CARD_H = (CARD_W * 4) / 3
const CONTAINER_H = 300

// Items sit at fixed 36deg slots around a closed ring (rotateY(offset*36deg)
// translateZ(radius) per item, offset = shortest signed distance from
// `current`, wrapping around the ring) — extends Coverflow's per-offset
// transform math but wraps it into a circle so there's no "ran out of items"
// edge at either side. Using a fixed angle step (rather than 360/count) keeps
// neighbor spacing constant regardless of how many photos exist; combined
// with progressively smaller scale per offset, RADIUS=235/ANGLE_STEP=36 keeps
// the immediate neighbor's bounding box clear of the focused photo's — see
// the comment above the map() below for the actual numbers. Items past the
// ring's perpendicular (depth <= 0) are never rendered — at depth 0 an item's
// screen X coincides with the front item's (sin(180deg)=0), so keeping it
// mounted just to fade it out produced a ghost directly behind the focused
// photo; cutting it entirely removes that overlap outright. Navigation is
// purely gesture-driven (scroll/swipe/drag via useGestureNav) — no on-screen
// controls or decorative center structure.
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
  const autoplay = useAutoPlay(filtered.length, () => step(1))

  return (
    <div {...autoplay}>
      <DemoBanner isDemo={isDemo} accent={accent} language={language} />
      <CategoryTabs categories={categories} activeCategory={activeCategory} setActiveCategory={setActiveCategory} accent={accent} fontColor={fontColor} />

      <div className="relative mx-auto select-none touch-none" style={{ height: CONTAINER_H, perspective: 1400 }} {...gesture}>
        <div className="relative w-full h-full" style={{ transformStyle: 'preserve-3d' }}>
          {filtered.map((item, i) => {
            const n = filtered.length
            let offset = i - current
            if (n > 0) {
              if (offset > n / 2) offset -= n
              if (offset < -n / 2) offset += n
            }
            const angle = offset * ANGLE_STEP
            const rad = (angle * Math.PI) / 180
            const depth = Math.cos(rad)
            if (depth <= 0) return null // back half of the ring — never mounted
            const isFocus = offset === 0
            // Front card: full size (half-width 75). Neighbors shrink further
            // per slot (0.68 at |offset|=1, 0.54 at |offset|=2 — the only two
            // slots depth<=0 doesn't already exclude at this angle step) — at
            // RADIUS=235/ANGLE_STEP=36 that keeps the immediate neighbor's
            // bounding box clear of the front card's, with only a few
            // imperceptible px of overlap between the two outermost (barely
            // visible, near-zero-opacity) slots.
            const scale = isFocus ? 1 : Math.max(0.5, 0.82 - Math.abs(offset) * 0.14)
            return (
              <button key={item.id}
                onClick={() => isFocus ? setLightbox({ items: filtered, index: current }) : setCurrent(i)}
                className="absolute rounded-xl overflow-hidden shadow-2xl group"
                style={{
                  width: CARD_W,
                  aspectRatio: '3/4',
                  left: '50%',
                  top: '50%',
                  marginLeft: -CARD_W / 2,
                  marginTop: -CARD_H / 2,
                  transform: `rotateY(${angle}deg) translateZ(${RADIUS}px) scale(${scale})`,
                  opacity: depth,
                  zIndex: Math.round(100 * depth) + 100,
                  transition: 'transform 0.3s ease-out, opacity 0.3s ease-out',
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
    </div>
  )
}
