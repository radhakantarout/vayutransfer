import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import fs from 'fs'
import path from 'path'

const CATEGORIES = [
  { slug: 'wedding',        name: 'Wedding',         label: 'Timeless ceremonies',    accent: '#F43F5E', shade: 'from-rose-950 to-rose-900' },
  { slug: 'pre-wedding',    name: 'Pre-Wedding',      label: 'Love stories begin',     accent: '#F59E0B', shade: 'from-amber-950 to-orange-900' },
  { slug: 'corporate',      name: 'Corporate',        label: 'Professional moments',   accent: '#3B82F6', shade: 'from-blue-950 to-slate-900' },
  { slug: 'school-college', name: 'School & College', label: 'Memories for life',      accent: '#14B8A6', shade: 'from-teal-950 to-emerald-900' },
  { slug: 'portfolio',      name: 'Portfolio',        label: 'Showcase your art',      accent: '#8B5CF6', shade: 'from-violet-950 to-purple-900' },
  { slug: 'fashion',        name: 'Fashion',          label: 'Style in every frame',   accent: '#D946EF', shade: 'from-fuchsia-950 to-pink-900' },
]

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif'])

function getPhotos(slug: string): string[] {
  try {
    return fs
      .readdirSync(path.join(process.cwd(), 'public', 'images', 'gallery', slug))
      .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .sort()
      .map((f) => `/images/gallery/${slug}/${f}`)
  } catch { return [] }
}

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const cat = CATEGORIES.find((c) => c.slug === slug)
  if (!cat) return {}
  return {
    title: `${cat.name} Album — VayuStudios`,
    description: `${cat.label}. Browse our ${cat.name.toLowerCase()} digital photo album.`,
  }
}

export default async function ShowcasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const cat = CATEGORIES.find((c) => c.slug === slug)
  if (!cat) notFound()

  const files = getPhotos(cat.slug)
  // Pad to exactly 6 slots
  const photos = Array.from({ length: 6 }, (_, i) => files[i] ?? null)

  // Spreads: cover (title + photo0) + 2 photo spreads + closing
  const spreads = [
    { left: null,      right: photos[0], isCover: true  },
    { left: photos[1], right: photos[2], isCover: false },
    { left: photos[3], right: photos[4], isCover: false },
    { left: photos[5], right: null,      isClose: true  },
  ] as { left: string|null; right: string|null; isCover?: boolean; isClose?: boolean }[]

  return (
    <main className="min-h-screen bg-[#07090E]">

      {/* ── Page header ── */}
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-6 flex items-center justify-between">
        <Link href="/studio/examples" className="inline-flex items-center gap-2 text-muted hover:text-accent text-sm transition-colors">
          ← All categories
        </Link>
        <span className="text-xs text-muted hidden sm:block">Scroll to browse the album</span>
      </div>

      {/* ── Album title ── */}
      <div className="max-w-5xl mx-auto px-4 pb-10 text-center">
        <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: cat.accent }}>Digital Photo Album</p>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-2">{cat.name}</h1>
        <p className="text-white/50 text-base">{cat.label}</p>
      </div>

      {/* ── Album spreads ── */}
      <div className="max-w-5xl mx-auto px-4 pb-16 space-y-10">
        {spreads.map((spread, si) => (
          <AlbumSpread
            key={si}
            spread={spread}
            cat={cat}
            spreadNum={si + 1}
            totalSpreads={spreads.length}
          />
        ))}
      </div>

      {/* ── Digital album service CTA ── */}
      <section className="max-w-5xl mx-auto px-4 pb-10">
        <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: 'linear-gradient(135deg, #0D0F14 0%, #111827 100%)' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            {/* Left — offer */}
            <div className="p-8 sm:p-10 border-b md:border-b-0 md:border-r border-white/10">
              <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full border mb-4" style={{ color: cat.accent, borderColor: `${cat.accent}40`, background: `${cat.accent}15` }}>
                New service
              </span>
              <h2 className="text-2xl font-extrabold text-white mb-3">Deliver this album to your client</h2>
              <p className="text-white/60 text-sm leading-relaxed mb-6">
                Every gallery you deliver through VayuStudios can be presented as a stunning 3D digital album — branded with your studio name, shareable by link, and ready to print.
              </p>
              <ul className="space-y-2.5 mb-8">
                {[
                  'Beautiful album layout — no design skills needed',
                  'Client browses, selects, and comments inside the album',
                  'Shareable secure link — no download required',
                  'Studio-branded with your logo and name',
                  'Print-ready export for physical album orders',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-white/70">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: cat.accent }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M5 13l4 4L19 7"/></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/studio/home#get-started"
                className="inline-block font-bold px-7 py-3.5 rounded-xl text-sm transition-colors"
                style={{ background: cat.accent, color: '#07090E' }}
              >
                Get digital album for my studio →
              </Link>
            </div>

            {/* Right — mini album preview */}
            <div className="p-8 sm:p-10 flex items-center justify-center">
              <div className="w-full max-w-xs" style={{ perspective: '800px' }}>
                <div
                  className="relative rounded-lg overflow-hidden"
                  style={{
                    transform: 'rotateX(6deg) rotateY(-8deg)',
                    transformStyle: 'preserve-3d',
                    boxShadow: '0 30px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)',
                  }}
                >
                  {/* Mini spread preview */}
                  <div className="flex" style={{ background: '#12100E' }}>
                    <div className="flex-1 aspect-[3/4] relative" style={{ background: '#0D0F14' }}>
                      {photos[0] && <Image src={photos[0]} alt="preview" fill className="object-cover opacity-90" sizes="150px" />}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    </div>
                    <div className="w-2" style={{ background: '#0A0705', boxShadow: 'inset -1px 0 3px rgba(0,0,0,0.5), inset 1px 0 3px rgba(0,0,0,0.5)' }} />
                    <div className="flex-1 aspect-[3/4] relative" style={{ background: '#0D0F14' }}>
                      {photos[1] && <Image src={photos[1]} alt="preview" fill className="object-cover opacity-90" sizes="150px" />}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    </div>
                  </div>
                  {/* Album bottom strip */}
                  <div className="h-5 flex items-center justify-center" style={{ background: '#12100E' }}>
                    <span className="text-[8px] text-white/30 font-bold tracking-widest uppercase">VayuStudios</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Bottom nav ── */}
      <div className="max-w-5xl mx-auto px-4 pb-16 text-center">
        <Link href="/studio/home#get-started" className="inline-block bg-accent text-bg font-bold px-8 py-4 rounded-xl hover:bg-accent/90 transition-colors text-sm shadow-lg shadow-accent/20 mr-4">
          Set up your studio →
        </Link>
        <Link href="/studio/examples" className="inline-block border border-white/20 text-white/60 font-medium px-8 py-4 rounded-xl hover:border-white/40 hover:text-white transition-colors text-sm">
          ← Browse all categories
        </Link>
      </div>
    </main>
  )
}

/* ── Album spread component ───────────────────────────── */
function AlbumSpread({
  spread,
  cat,
  spreadNum,
  totalSpreads,
}: {
  spread: { left: string|null; right: string|null; isCover?: boolean; isClose?: boolean }
  cat:    { name: string; label: string; accent: string; shade: string }
  spreadNum:    number
  totalSpreads: number
}) {
  return (
    <div style={{ perspective: '1200px' }}>
      <div
        className="relative rounded-lg overflow-hidden"
        style={{
          transform: 'rotateX(4deg)',
          transformStyle: 'preserve-3d',
          boxShadow: '0 40px 80px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.05)',
        }}
      >
        {/* Album outer frame (leather spine) */}
        <div className="flex" style={{ background: '#12100E', padding: '10px 10px 0 10px', gap: 0 }}>

          {/* Left page */}
          <div
            className="flex-1 relative overflow-hidden"
            style={{
              background: '#0D0F14',
              minHeight: '340px',
              borderRadius: '4px 0 0 4px',
              boxShadow: 'inset -4px 0 8px rgba(0,0,0,0.4)',
            }}
          >
            {spread.isCover ? (
              /* Cover left — title page */
              <div className={`absolute inset-0 bg-gradient-to-br ${cat.shade} flex flex-col items-center justify-center p-8 text-center`}>
                <div className="w-12 h-0.5 mb-5 mx-auto rounded-full opacity-60" style={{ background: cat.accent }} />
                <p className="text-xs font-bold uppercase tracking-[0.25em] mb-3 opacity-60" style={{ color: cat.accent }}>VayuStudios</p>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-2 leading-tight">{cat.name}</h2>
                <p className="text-white/50 text-sm">{cat.label}</p>
                <div className="w-12 h-0.5 mt-5 mx-auto rounded-full opacity-60" style={{ background: cat.accent }} />
              </div>
            ) : spread.isClose ? (
              /* Close left — final photo if available */
              spread.left ? (
                <PhotoPage src={spread.left} alt={cat.name} />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center" style={{ background: '#0D0F14' }}>
                  <div className="w-8 h-0.5 mb-4 mx-auto rounded-full opacity-40" style={{ background: cat.accent }} />
                  <p className="text-white/30 text-xs font-medium uppercase tracking-widest">End of album</p>
                  <div className="w-8 h-0.5 mt-4 mx-auto rounded-full opacity-40" style={{ background: cat.accent }} />
                </div>
              )
            ) : (
              spread.left ? (
                <PhotoPage src={spread.left} alt={cat.name} />
              ) : (
                <EmptyPage accent={cat.accent} />
              )
            )}

            {/* Page number */}
            <div className="absolute bottom-3 left-4 text-[10px] text-white/20 font-medium select-none">
              {(spreadNum - 1) * 2 + 1}
            </div>
          </div>

          {/* Spine */}
          <div
            style={{
              width: '14px',
              flexShrink: 0,
              background: 'linear-gradient(to right, #060504, #0F0C09, #060504)',
              boxShadow: 'inset 2px 0 4px rgba(255,255,255,0.03), inset -2px 0 4px rgba(255,255,255,0.03)',
            }}
          />

          {/* Right page */}
          <div
            className="flex-1 relative overflow-hidden"
            style={{
              background: '#0D0F14',
              minHeight: '340px',
              borderRadius: '0 4px 4px 0',
              boxShadow: 'inset 4px 0 8px rgba(0,0,0,0.4)',
            }}
          >
            {spread.right ? (
              <PhotoPage src={spread.right} alt={cat.name} priority={spreadNum === 1} />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
                <p className="text-white/20 text-xs font-medium uppercase tracking-widest">More coming soon</p>
              </div>
            )}

            {/* Page number */}
            <div className="absolute bottom-3 right-4 text-[10px] text-white/20 font-medium select-none">
              {(spreadNum - 1) * 2 + 2}
            </div>
          </div>
        </div>

        {/* Album bottom strip */}
        <div
          className="flex items-center justify-between px-5"
          style={{ background: '#12100E', height: '32px' }}
        >
          <span className="text-[9px] text-white/20 font-bold uppercase tracking-widest">VayuStudios</span>
          <span className="text-[9px] text-white/15">{spreadNum} / {totalSpreads}</span>
          <span className="text-[9px] text-white/20 font-bold uppercase tracking-widest">{cat.name}</span>
        </div>
      </div>
    </div>
  )
}

function PhotoPage({ src, alt, priority = false }: { src: string; alt: string; priority?: boolean }) {
  return (
    <div className="absolute inset-0">
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover"
        priority={priority}
        sizes="(max-width: 768px) 45vw, 400px"
      />
      {/* subtle vignette */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.4) 100%)' }} />
      {/* corner mounts */}
      <CornerMount pos="top-left"     />
      <CornerMount pos="top-right"    />
      <CornerMount pos="bottom-left"  />
      <CornerMount pos="bottom-right" />
    </div>
  )
}

function EmptyPage(_: { accent: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center">
        <span className="text-white/20 text-xs">+</span>
      </div>
    </div>
  )
}

function CornerMount({ pos }: { pos: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }) {
  const base = 'absolute w-4 h-4 pointer-events-none'
  const positions: Record<string, string> = {
    'top-left':     'top-2 left-2',
    'top-right':    'top-2 right-2 rotate-90',
    'bottom-left':  'bottom-2 left-2 -rotate-90',
    'bottom-right': 'bottom-2 right-2 rotate-180',
  }
  return (
    <svg className={`${base} ${positions[pos]}`} viewBox="0 0 16 16" fill="none">
      <path d="M1 8 L1 1 L8 1" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
