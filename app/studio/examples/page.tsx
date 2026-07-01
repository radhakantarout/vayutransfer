import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import fs from 'fs'
import path from 'path'

export const metadata: Metadata = {
  title: 'Examples — VayuStudios',
  description: 'Browse example galleries across wedding, pre-wedding, corporate, school, portfolio and fashion photography.',
}

const CATEGORIES = [
  { slug: 'wedding',        name: 'Wedding',         label: 'Timeless ceremonies',  shades: ['bg-rose-950','bg-rose-900','bg-pink-950','bg-rose-800/80','bg-pink-900','bg-rose-950'] },
  { slug: 'pre-wedding',    name: 'Pre-Wedding',      label: 'Love stories begin',   shades: ['bg-amber-950','bg-orange-900','bg-amber-900','bg-orange-950','bg-amber-800/80','bg-orange-900'] },
  { slug: 'corporate',      name: 'Corporate',        label: 'Professional moments', shades: ['bg-blue-950','bg-slate-800','bg-blue-900','bg-slate-900','bg-blue-800/80','bg-slate-800'] },
  { slug: 'school-college', name: 'School & College', label: 'Memories for life',    shades: ['bg-teal-950','bg-emerald-900','bg-teal-900','bg-emerald-950','bg-teal-800/80','bg-emerald-900'] },
  { slug: 'portfolio',      name: 'Portfolio',        label: 'Showcase your art',    shades: ['bg-violet-950','bg-purple-900','bg-violet-900','bg-purple-950','bg-violet-800/80','bg-purple-900'] },
  { slug: 'fashion',        name: 'Fashion',          label: 'Style in every frame', shades: ['bg-fuchsia-950','bg-pink-900','bg-fuchsia-900','bg-pink-950','bg-fuchsia-800/80','bg-pink-900'] },
]

const IMAGE_EXTS = new Set(['.jpg','.jpeg','.png','.webp','.avif'])

function getCoverPhoto(slug: string): string | null {
  const dir = path.join(process.cwd(), 'public', 'images', 'gallery', slug)
  try {
    const files = fs.readdirSync(dir).filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase())).sort()
    return files[0] ? `/images/gallery/${slug}/${files[0]}` : null
  } catch { return null }
}

export default function ExamplesPage() {
  const cats = CATEGORIES.map((c) => ({ ...c, cover: getCoverPhoto(c.slug) }))

  return (
    <main className="min-h-screen bg-bg">
      {/* Hero */}
      <section className="bg-card border-b border-border py-16 text-center">
        <div className="max-w-2xl mx-auto px-4">
          <span className="inline-block text-accent text-xs font-bold uppercase tracking-widest mb-3 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">Examples</span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-text-primary mt-3 mb-4">See VayuStudios in action</h1>
          <p className="text-muted text-lg leading-relaxed">Browse sample galleries across every event category we support. Click any category to explore the full gallery experience.</p>
        </div>
      </section>

      {/* Gallery grid */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {cats.map((cat) => (
            <Link
              key={cat.slug}
              href={`/studio/showcase/${cat.slug}`}
              className="group block bg-card border border-border rounded-2xl overflow-hidden hover:border-accent/50 hover:-translate-y-1 transition-all duration-300 hover:shadow-xl hover:shadow-accent/10"
            >
              {/* Cover photo */}
              <div className={`relative h-52 ${cat.shades[0]}`}>
                {cat.cover ? (
                  <Image src={cat.cover} alt={cat.name} fill className="object-cover group-hover:scale-105 transition-transform duration-500" sizes="(max-width:640px) 100vw, 33vw" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-white/20 text-sm font-medium">Photos coming soon</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-4">
                  <h2 className="text-white font-extrabold text-lg drop-shadow">{cat.name}</h2>
                  <p className="text-white/70 text-xs">{cat.label}</p>
                </div>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-xs text-muted">6 sample photos</span>
                <span className="text-xs text-accent font-semibold group-hover:underline">View gallery →</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* What clients see */}
      <section className="bg-card border-y border-border py-14">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-extrabold text-text-primary mb-3">This is what your clients experience</h2>
          <p className="text-muted text-sm max-w-xl mx-auto mb-8">
            Every gallery above is a live example of the VayuStudios client experience — watermarked previews, photo selection, and a beautiful presentation of your work.
          </p>
          <div className="grid grid-cols-3 gap-4 text-center mb-8">
            {[
              { icon: '🔒', label: 'Watermarked' },
              { icon: '❤️', label: 'Selectable' },
              { icon: '📱', label: 'Mobile-first' },
            ].map(({ icon, label }) => (
              <div key={label} className="bg-bg border border-border rounded-xl p-4">
                <div className="text-2xl mb-1">{icon}</div>
                <p className="text-xs font-semibold text-text-primary">{label}</p>
              </div>
            ))}
          </div>
          <Link href="/studio/home#get-started" className="inline-block bg-accent text-bg font-bold px-8 py-3.5 rounded-xl hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20">
            Get your studio set up →
          </Link>
        </div>
      </section>
    </main>
  )
}
