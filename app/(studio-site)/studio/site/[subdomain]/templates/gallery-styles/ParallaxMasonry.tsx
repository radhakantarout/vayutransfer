'use client'

import { useEffect, useRef, useState } from 'react'
import { useGalleryData, DemoBanner, CategoryTabs, TileMedia, VideoPlayBadge, VideoLightbox, type GalleryItem } from './shared'
import type { WebsiteLanguage } from '@/types/studio'

const COLS = 3
// Each column drifts at a different speed as the page scrolls, giving a
// subtle sense of depth — pure transform, no JS animation library.
const SPEEDS = [0, 0.06, -0.05]

export default function ParallaxMasonry({ photos, studioName, accent = '#C9A84C', fontColor = '#ffffff', language }: {
  photos: GalleryItem[]; studioName: string; accent?: string; fontColor?: string; language?: WebsiteLanguage
}) {
  const { isDemo, categories, activeCategory, setActiveCategory, filtered } = useGalleryData(photos)
  const [lightbox, setLightbox] = useState<{ items: GalleryItem[]; index: number } | null>(null)
  const colRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    let ticking = false
    const update = () => {
      const vh = window.innerHeight
      colRefs.current.forEach((col, ci) => {
        if (!col) return
        const rect = col.getBoundingClientRect()
        const center = rect.top + rect.height / 2
        const dist = center - vh / 2
        col.style.transform = `translateY(${dist * SPEEDS[ci % SPEEDS.length]}px)`
      })
      ticking = false
    }
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update) } }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [filtered.length])

  const columns: GalleryItem[][] = Array.from({ length: COLS }, () => [])
  filtered.forEach((item, i) => columns[i % COLS].push(item))

  return (
    <>
      <DemoBanner isDemo={isDemo} accent={accent} language={language} />
      <CategoryTabs categories={categories} activeCategory={activeCategory} setActiveCategory={setActiveCategory} accent={accent} fontColor={fontColor} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
        {columns.map((col, ci) => (
          <div key={ci} ref={el => { colRefs.current[ci] = el }} className="flex flex-col gap-4 sm:gap-6 will-change-transform">
            {col.map((item, ii) => {
              const globalIndex = ci + ii * COLS
              return (
                <button key={item.id} onClick={() => setLightbox({ items: filtered, index: globalIndex })}
                  className="relative overflow-hidden rounded-xl group cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
                  style={{ aspectRatio: ci % 2 === 0 ? '3/4' : '1/1' }}>
                  <TileMedia item={item} index={globalIndex} />
                  {item.type === 'video' && <VideoPlayBadge />}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      {lightbox && <VideoLightbox items={lightbox.items} startIndex={lightbox.index} onClose={() => setLightbox(null)} language={language} />}
    </>
  )
}
