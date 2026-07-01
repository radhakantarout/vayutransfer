import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import fs from 'fs'
import path from 'path'

import AlbumBook, { type Spread, type PageContent } from './AlbumBook'

const CATEGORIES = [
  { slug: 'wedding',        name: 'Wedding',         label: 'Timeless ceremonies',  accent: '#F43F5E' },
  { slug: 'pre-wedding',    name: 'Pre-Wedding',      label: 'Love stories begin',   accent: '#F59E0B' },
  { slug: 'corporate',      name: 'Corporate',        label: 'Professional moments', accent: '#3B82F6' },
  { slug: 'school-college', name: 'School & College', label: 'Memories for life',    accent: '#14B8A6' },
  { slug: 'portfolio',      name: 'Portfolio',        label: 'Showcase your art',    accent: '#8B5CF6' },
  { slug: 'fashion',        name: 'Fashion',          label: 'Style in every frame', accent: '#D946EF' },
]

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif'])

function getPhotos(slug: string): string[] {
  try {
    return fs
      .readdirSync(path.join(process.cwd(), 'public', 'images', 'gallery', slug))
      .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .sort()
      .map(f => `/images/gallery/${slug}/${f}`)
  } catch { return [] }
}

export function generateStaticParams() {
  return CATEGORIES.map(c => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const cat = CATEGORIES.find(c => c.slug === slug)
  if (!cat) return {}
  return {
    title:       `${cat.name} Album — VayuStudios`,
    description: `${cat.label}. Browse our ${cat.name.toLowerCase()} digital photo album.`,
  }
}

export default async function ShowcasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const cat = CATEGORIES.find(c => c.slug === slug)
  if (!cat) notFound()

  const files = getPhotos(cat.slug)

  // Helper: 2-photo page
  const photos = (a: number, b: number): PageContent => ({
    type: 'photos',
    srcs: [files[a] ?? null, files[b] ?? null],
    alt:  cat.name,
  })

  // 3 spreads:
  //   Cover  | photos 0+1
  //   2+3    | 4+5
  //   CTA    | Back cover
  const spreads: Spread[] = [
    {
      left:  { type: 'cover', title: cat.name, label: cat.label, accent: cat.accent },
      right: photos(0, 1),
    },
    {
      left:  photos(2, 3),
      right: photos(4, 5),
    },
    {
      left:  { type: 'cta',  accent: cat.accent, catName: cat.name },
      right: { type: 'back', accent: cat.accent },
    },
  ]

  return (
    <main
      className="min-h-screen"
      style={{ background: 'radial-gradient(ellipse at 50% 40%, #151D2E 0%, #090D18 100%)' }}
    >
      {/* Header */}
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-6 flex items-center justify-between">
        <Link href="/studio/examples" className="text-sm font-medium text-white/40 hover:text-white/75 transition-colors">
          ← All categories
        </Link>
        <span className="text-xs hidden sm:block" style={{ color: 'rgba(255,255,255,0.22)' }}>
          Use ← → keys or swipe to turn pages
        </span>
      </div>

      {/* Title */}
      <div className="max-w-5xl mx-auto px-4 pb-10 text-center">
        <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: cat.accent }}>
          Digital Photo Album
        </p>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-2">{cat.name}</h1>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.38)' }}>{cat.label}</p>
      </div>

      {/* Interactive album */}
      <div className="pb-24">
        <AlbumBook spreads={spreads} catName={cat.name} catAccent={cat.accent} />
      </div>

      {/* Bottom nav */}
      <div className="max-w-5xl mx-auto px-4 pb-16 text-center">
        <Link href="/studio/home#get-started" className="inline-block bg-accent text-bg font-bold px-8 py-4 rounded-xl hover:bg-accent/90 transition-colors text-sm shadow-lg shadow-accent/20 mr-4">
          Set up your studio →
        </Link>
        <Link href="/studio/examples" className="inline-block border border-white/15 text-white/45 font-medium px-8 py-4 rounded-xl hover:border-white/30 hover:text-white/70 transition-colors text-sm">
          ← Browse all categories
        </Link>
      </div>
    </main>
  )
}
