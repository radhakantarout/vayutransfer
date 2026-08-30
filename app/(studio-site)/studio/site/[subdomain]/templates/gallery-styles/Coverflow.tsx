'use client'

import { useEffect, useState } from 'react'
import { useGalleryData, DemoBanner, CategoryTabs, TileMedia, VideoPlayBadge, VideoLightbox, type GalleryItem } from './shared'
import { translator } from '@/lib/studio/i18n'
import type { WebsiteLanguage } from '@/types/studio'

// Classic coverflow — a large centered item in 3D perspective, side items
// tilted away and receding. Click a side item (or Prev/Next) to bring it to
// center; click the centered item to open it fullscreen.
export default function Coverflow({ photos, studioName, accent = '#C9A84C', fontColor = '#ffffff', language }: {
  photos: GalleryItem[]; studioName: string; accent?: string; fontColor?: string; language?: WebsiteLanguage
}) {
  const t = translator(language)
  const { isDemo, categories, activeCategory, setActiveCategory, filtered } = useGalleryData(photos)
  const [center, setCenter] = useState(0)
  const [lightbox, setLightbox] = useState<{ items: GalleryItem[]; index: number } | null>(null)

  useEffect(() => setCenter(0), [activeCategory])

  const prev = () => setCenter(c => Math.max(0, c - 1))
  const next = () => setCenter(c => Math.min(filtered.length - 1, c + 1))

  return (
    <>
      <DemoBanner isDemo={isDemo} accent={accent} language={language} />
      <CategoryTabs categories={categories} activeCategory={activeCategory} setActiveCategory={setActiveCategory} accent={accent} fontColor={fontColor} />
      <div className="relative flex items-center justify-center overflow-hidden" style={{ height: 320, perspective: 1200 }}>
        {filtered.map((item, i) => {
          const offset = i - center
          if (Math.abs(offset) > 3) return null
          const isCenter = offset === 0
          return (
            <button key={item.id}
              onClick={() => isCenter ? setLightbox({ items: filtered, index: i }) : setCenter(i)}
              className="absolute rounded-xl overflow-hidden shadow-2xl group transition-all duration-400 ease-out"
              style={{
                width: 190,
                aspectRatio: '3/4',
                transform: `translateX(${offset * 120}px) translateZ(${isCenter ? 0 : -110}px) rotateY(${offset * -32}deg) scale(${isCenter ? 1 : 0.85})`,
                zIndex: 10 - Math.abs(offset),
                opacity: Math.abs(offset) > 2 ? 0.25 : 1,
              }}>
              <TileMedia item={item} index={i} />
              {item.type === 'video' && isCenter && <VideoPlayBadge />}
            </button>
          )
        })}
      </div>
      <div className="flex items-center justify-center gap-6 mt-6">
        <button onClick={prev} disabled={center === 0}
          className="px-5 py-2 rounded-full text-sm font-semibold border disabled:opacity-30 transition-all"
          style={{ color: fontColor, borderColor: `${fontColor}33` }}>← {t('galleryPrev', 'Prev')}</button>
        <span className="text-xs opacity-50" style={{ color: fontColor }}>{filtered.length ? center + 1 : 0} / {filtered.length}</span>
        <button onClick={next} disabled={center >= filtered.length - 1}
          className="px-5 py-2 rounded-full text-sm font-semibold border disabled:opacity-30 transition-all"
          style={{ color: fontColor, borderColor: `${fontColor}33` }}>{t('galleryNext', 'Next')} →</button>
      </div>
      {lightbox && <VideoLightbox items={lightbox.items} startIndex={lightbox.index} onClose={() => setLightbox(null)} language={language} />}
    </>
  )
}
