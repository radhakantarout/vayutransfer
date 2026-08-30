'use client'

import { useEffect, useRef, useState } from 'react'
import { useGalleryData, DemoBanner, CategoryTabs, TileMedia, VideoPlayBadge, VideoLightbox, type GalleryItem } from './shared'
import type { WebsiteLanguage } from '@/types/studio'

// Tiles tilt in 3D based on their scroll position — centered tiles sit flat,
// tiles above/below viewport-center rotate away, so scrolling up or down
// reads as the whole grid gently turning left/right. Mutates DOM style
// directly via refs (not React state) so scrolling never triggers a re-render.
export default function RotateScroll({ photos, studioName, accent = '#C9A84C', fontColor = '#ffffff', language }: {
  photos: GalleryItem[]; studioName: string; accent?: string; fontColor?: string; language?: WebsiteLanguage
}) {
  const { isDemo, categories, activeCategory, setActiveCategory, filtered } = useGalleryData(photos)
  const [lightbox, setLightbox] = useState<{ items: GalleryItem[]; index: number } | null>(null)
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    let ticking = false
    const update = () => {
      const vh = window.innerHeight
      tileRefs.current.forEach(el => {
        if (!el) return
        const rect = el.getBoundingClientRect()
        const center = rect.top + rect.height / 2
        const offset = Math.max(-1, Math.min(1, (center - vh / 2) / (vh / 2)))
        el.style.transform = `perspective(1000px) rotateY(${offset * 16}deg) scale(${1 - Math.abs(offset) * 0.05})`
      })
      ticking = false
    }
    const onScroll = () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update) }
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [filtered.length])

  return (
    <>
      <DemoBanner isDemo={isDemo} accent={accent} language={language} />
      <CategoryTabs categories={categories} activeCategory={activeCategory} setActiveCategory={setActiveCategory} accent={accent} fontColor={fontColor} />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 sm:gap-8">
        {filtered.map((item, i) => (
          <button key={item.id} ref={el => { tileRefs.current[i] = el }}
            onClick={() => setLightbox({ items: filtered, index: i })}
            className="relative overflow-hidden rounded-xl group cursor-pointer will-change-transform"
            style={{ aspectRatio: '3/4', transformStyle: 'preserve-3d' }}>
            <TileMedia item={item} index={i} />
            {item.type === 'video' && <VideoPlayBadge />}
          </button>
        ))}
      </div>
      {lightbox && <VideoLightbox items={lightbox.items} startIndex={lightbox.index} onClose={() => setLightbox(null)} language={language} />}
    </>
  )
}
