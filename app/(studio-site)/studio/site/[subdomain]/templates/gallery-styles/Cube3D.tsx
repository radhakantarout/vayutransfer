'use client'

import { useEffect, useState } from 'react'
import { useGalleryData, useGestureNav, useAutoPlay, DemoBanner, CategoryTabs, TileMedia, VideoPlayBadge, VideoLightbox, type GalleryItem } from './shared'
import { translator } from '@/lib/studio/i18n'
import type { WebsiteLanguage } from '@/types/studio'

const HEX_ANGLE = 60 // degrees between adjacent faces of a hexagonal prism —
                      // with this fixed step, cos(angle) naturally excludes
                      // anything past the front face's two immediate
                      // neighbors (offset ±1, depth 0.5) since offset ±2
                      // (120deg) has depth -0.5, keeping exactly 3 visible
                      // faces (the "half" of the hexagon facing the viewer)
                      // with no extra windowing logic needed.
const CARD_W = 190
const CARD_H = (CARD_W * 4) / 3
// Apothem of a regular hexagon whose faces are CARD_W wide — the distance
// from the center axis to the middle of a face. rotateY(angle) translateZ(R)
// places a face tangent to a circle of radius R at that angle, which is
// exactly how a regular polygon's faces meet edge-to-edge with zero gap and
// zero overlap when R equals the apothem (side * √3/2 for a hexagon). Faces
// are deliberately NOT scaled down (only rotated/translated) — scaling a
// side face from its own center would shrink it away from the shared edge
// and reintroduce a gap, which is exactly what this replaces.
const RADIUS = (CARD_W * Math.sqrt(3)) / 2

// A hexagonal-prism carousel: the front face sits flat facing the viewer,
// its two immediate neighbors are angled 60deg away on either side, meeting
// it edge-to-edge — like standing in front of a spinning hexagonal drum,
// seeing only the half that faces you. Stepping rotates the whole assembly
// by one 60deg face at a time, so a side face swings around to become the
// new front and vice versa (same shortest-signed-offset ring math as
// Orbit3D, just with a fixed 60deg step and always exactly 3 faces on
// screen instead of a wide ring).
export default function Cube3D({ photos, studioName, accent = '#C9A84C', fontColor = '#ffffff', language }: {
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

      <div className="relative mx-auto select-none touch-none" style={{ height: 300, perspective: 1200 }} {...gesture}>
        <div className="relative w-full h-full" style={{ transformStyle: 'preserve-3d' }}>
          {filtered.map((item, i) => {
            const n = filtered.length
            let offset = i - current
            if (n > 0) {
              if (offset > n / 2) offset -= n
              if (offset < -n / 2) offset += n
            }
            const angle = offset * HEX_ANGLE
            const rad = (angle * Math.PI) / 180
            const depth = Math.cos(rad)
            if (depth <= 0) return null // past the two immediate hex faces — never mounted
            const isFocus = offset === 0
            return (
              <button key={item.id}
                onClick={() => isFocus ? setLightbox({ items: filtered, index: current }) : setCurrent(i)}
                className="absolute overflow-hidden shadow-2xl"
                style={{
                  width: CARD_W,
                  aspectRatio: '3/4',
                  left: '50%',
                  top: '50%',
                  marginLeft: -CARD_W / 2,
                  marginTop: -CARD_H / 2,
                  borderRadius: 6,
                  transform: `rotateY(${angle}deg) translateZ(${RADIUS}px)`,
                  opacity: isFocus ? 1 : 0.9,
                  zIndex: Math.round(100 * depth) + 100,
                  transition: 'transform 0.4s ease-out, opacity 0.4s ease-out',
                }}>
                <TileMedia item={item} index={i} />
                {isFocus && item.type === 'video' && <VideoPlayBadge />}
              </button>
            )
          })}
        </div>
      </div>

      {filtered.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-5">
          {filtered.map((_, i) => (
            <button key={i} onClick={() => setCurrent(i)}
              className="h-1.5 rounded-full transition-all"
              style={{ width: i === current ? 18 : 6, background: i === current ? accent : `${fontColor}33` }} />
          ))}
        </div>
      )}
      <p className="text-center text-xs opacity-40 mt-3" style={{ color: fontColor }}>{t('galleryScrollNav', 'Scroll or swipe to explore')}</p>

      {lightbox && <VideoLightbox items={lightbox.items} startIndex={lightbox.index} onClose={() => setLightbox(null)} language={language} />}
    </div>
  )
}
