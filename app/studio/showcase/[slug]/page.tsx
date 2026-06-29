import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import fs from 'fs'
import path from 'path'

const CATEGORIES = [
  { slug: 'wedding',        name: 'Wedding',         label: 'Timeless ceremonies',    shades: ['bg-rose-950', 'bg-rose-900', 'bg-pink-950', 'bg-rose-800/80', 'bg-pink-900', 'bg-rose-950'] },
  { slug: 'pre-wedding',    name: 'Pre-Wedding',      label: 'Love stories begin',     shades: ['bg-amber-950', 'bg-orange-900', 'bg-amber-900', 'bg-orange-950', 'bg-amber-800/80', 'bg-orange-900'] },
  { slug: 'corporate',      name: 'Corporate',        label: 'Professional moments',   shades: ['bg-blue-950', 'bg-slate-800', 'bg-blue-900', 'bg-slate-900', 'bg-blue-800/80', 'bg-slate-800'] },
  { slug: 'school-college', name: 'School & College', label: 'Memories for life',      shades: ['bg-teal-950', 'bg-emerald-900', 'bg-teal-900', 'bg-emerald-950', 'bg-teal-800/80', 'bg-emerald-900'] },
  { slug: 'portfolio',      name: 'Portfolio',        label: 'Showcase your art',      shades: ['bg-violet-950', 'bg-purple-900', 'bg-violet-900', 'bg-purple-950', 'bg-violet-800/80', 'bg-purple-900'] },
  { slug: 'fashion',        name: 'Fashion',          label: 'Style in every frame',   shades: ['bg-fuchsia-950', 'bg-pink-900', 'bg-fuchsia-900', 'bg-pink-950', 'bg-fuchsia-800/80', 'bg-pink-900'] },
]

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif'])

function getPhotosForSlug(slug: string) {
  const dir = path.join(process.cwd(), 'public', 'images', 'gallery', slug)
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .sort()
      .map((f) => `/images/gallery/${slug}/${f}`)
  } catch {
    return []
  }
}

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const cat = CATEGORIES.find((c) => c.slug === slug)
  if (!cat) return {}
  return {
    title: `${cat.name} Gallery — VayuStudios`,
    description: `${cat.label}. Browse our ${cat.name.toLowerCase()} photography portfolio.`,
  }
}

export default async function GalleryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const cat = CATEGORIES.find((c) => c.slug === slug)
  if (!cat) notFound()

  const filePaths = getPhotosForSlug(cat.slug)

  // Merge real photos with placeholder slots up to 6
  const photos = Array.from({ length: 6 }, (_, i) => ({
    src: filePaths[i] ?? null,
    alt: `${cat.name} photo ${i + 1}`,
    shade: cat.shades[i],
  }))

  return (
    <main className="min-h-screen bg-bg">
      {/* Back nav */}
      <div className="max-w-6xl mx-auto px-4 pt-8 pb-2">
        <Link
          href="/studio/home"
          className="inline-flex items-center gap-2 text-muted hover:text-accent text-sm transition-colors"
        >
          ← Back to all categories
        </Link>
      </div>

      {/* Header */}
      <div className="max-w-6xl mx-auto px-4 pt-4 pb-10">
        <p className="text-accent text-sm font-semibold uppercase tracking-widest mb-2">{cat.label}</p>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-text-primary">{cat.name}</h1>
        <p className="text-muted mt-3 text-base max-w-xl">
          A curated look at how VayuStudios helps photographers capture and deliver stunning {cat.name.toLowerCase()} work.
        </p>
      </div>

      {/* Photo grid — 1 large hero + 5 supporting */}
      <div className="max-w-6xl mx-auto px-4 pb-20">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {/* Photo 1 — large hero spanning 2 cols × 2 rows */}
          <div className="col-span-2 row-span-2 relative aspect-square sm:aspect-auto sm:h-[480px] rounded-2xl overflow-hidden">
            <PhotoSlot photo={photos[0]} priority />
          </div>

          {/* Photos 2–3 — stacked on the right */}
          {photos.slice(1, 3).map((photo, i) => (
            <div key={i} className="relative aspect-square rounded-2xl overflow-hidden">
              <PhotoSlot photo={photo} />
            </div>
          ))}

          {/* Photos 4–6 — full-width row of 3 */}
          {photos.slice(3, 6).map((photo, i) => (
            <div key={i} className="relative aspect-square rounded-2xl overflow-hidden">
              <PhotoSlot photo={photo} />
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="max-w-3xl mx-auto px-4 pb-20 text-center">
        <div className="bg-card border border-border rounded-2xl p-8 space-y-4">
          <h2 className="text-2xl font-extrabold text-text-primary">Want a gallery like this for your clients?</h2>
          <p className="text-muted text-sm">
            VayuStudios gives you a professional client gallery with watermarked previews, selections, and print-ready delivery.
          </p>
          <a
            href="/studio/home#get-started"
            className="inline-block bg-accent text-bg font-bold px-8 py-4 rounded-xl hover:bg-accent/90 transition-colors text-sm shadow-lg shadow-accent/20"
          >
            Get your studio setup →
          </a>
        </div>
      </div>
    </main>
  )
}

function PhotoSlot({
  photo,
  priority = false,
}: {
  photo: { src: string | null; alt: string; shade: string }
  priority?: boolean
}) {
  return (
    <>
      <div className={`absolute inset-0 ${photo.shade} flex items-center justify-center`}>
        {!photo.src && (
          <span className="text-white/20 text-xs font-medium">Photo coming soon</span>
        )}
      </div>
      {photo.src && (
        <Image
          src={photo.src}
          alt={photo.alt}
          fill
          className="object-cover hover:scale-105 transition-transform duration-500"
          priority={priority}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 400px"
        />
      )}
    </>
  )
}
