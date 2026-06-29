import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import EnquiryForm from './EnquiryForm'
import fs from 'fs'
import path from 'path'

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif'])

function getPhotosForSlug(slug: string): string[] {
  const dir = path.join(process.cwd(), 'public', 'images', 'gallery', slug)
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .sort()
      .slice(0, 6)
      .map((f) => `/images/gallery/${slug}/${f}`)
  } catch {
    return []
  }
}

export const metadata: Metadata = {
  title: 'VayuStudios — Professional Photo Galleries for Photographers',
  description: 'Upload photos, share a secure gallery with clients, let them select favourites, and send straight to print. Built for Indian wedding and event photographers.',
}

const STEPS = [
  {
    number: '01',
    title: 'Upload your photos',
    body: 'Drag and drop your full-resolution files. Watermarked previews are generated automatically — clients see the work, not the raws.',
  },
  {
    number: '02',
    title: 'Share with your client',
    body: 'One secure link. Clients log in with their phone number (OTP — no app install). They browse, select favourites, and mark photos for retouching.',
  },
  {
    number: '03',
    title: 'Send to print',
    body: 'Upload your edited finals. Generate a 7-day signed print link for your lab. They download exactly what they need — edited or original.',
  },
]

const FEATURES = [
  { icon: '🔒', title: 'Watermarked previews', body: 'Clients browse beautiful watermarked previews. Original files never leave your control.' },
  { icon: '📱', title: 'OTP client login', body: 'No passwords, no app install. Clients authenticate with their phone in seconds.' },
  { icon: '✏️', title: 'Editing requests', body: 'Clients flag photos that need retouching and leave per-photo comments.' },
  { icon: '🖨️', title: 'Secure print downloads', body: '7-day CloudFront-signed links for your print lab. Original files stay private on S3.' },
  { icon: '📁', title: 'Multi-project dashboard', body: 'Manage all your shoots in one place. See selection status at a glance.' },
  { icon: '🇮🇳', title: 'Built for India', body: 'Phone OTP via AWS SNS, Indian payment support, servers in Mumbai.' },
]

const EVENT_CATEGORIES = [
  {
    name: 'Wedding',
    slug: 'wedding',
    label: 'Timeless ceremonies',
    shades: ['bg-rose-950', 'bg-rose-900', 'bg-pink-950', 'bg-rose-800/80', 'bg-pink-900', 'bg-rose-950'],
  },
  {
    name: 'Pre-wedding',
    slug: 'pre-wedding',
    label: 'Love stories begin',
    shades: ['bg-amber-950', 'bg-orange-900', 'bg-amber-900', 'bg-orange-950', 'bg-amber-800/80', 'bg-orange-900'],
  },
  {
    name: 'Corporate',
    slug: 'corporate',
    label: 'Professional moments',
    shades: ['bg-blue-950', 'bg-slate-800', 'bg-blue-900', 'bg-slate-900', 'bg-blue-800/80', 'bg-slate-800'],
  },
  {
    name: 'School & College',
    slug: 'school-college',
    label: 'Memories for life',
    shades: ['bg-teal-950', 'bg-emerald-900', 'bg-teal-900', 'bg-emerald-950', 'bg-teal-800/80', 'bg-emerald-900'],
  },
  {
    name: 'Portfolio',
    slug: 'portfolio',
    label: 'Showcase your art',
    shades: ['bg-violet-950', 'bg-purple-900', 'bg-violet-900', 'bg-purple-950', 'bg-violet-800/80', 'bg-purple-900'],
  },
  {
    name: 'Fashion',
    slug: 'fashion',
    label: 'Style in every frame',
    shades: ['bg-fuchsia-950', 'bg-pink-900', 'bg-fuchsia-900', 'bg-pink-950', 'bg-fuchsia-800/80', 'bg-pink-900'],
  },
]

export default async function StudioHomePage() {
  const categoriesWithPhotos = EVENT_CATEGORIES.map((cat) => ({
    ...cat,
    photos: getPhotosForSlug(cat.slug),
  }))

  return (
    <main>
      {/* Hero */}
      <section className="relative min-h-[600px] sm:min-h-[680px] flex items-center overflow-hidden">
        {/* Background image */}
        <Image
          src="/images/home_1.png"
          alt="Photographer sharing memories with clients via VayuStudios"
          fill
          className="object-cover object-center"
          priority
        />
        {/* Dark gradient — deep on left where text sits, smooth fade to transparent right */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0B0F1A]/95 via-[#0B0F1A]/70 to-transparent" />
        {/* Bottom fade to blend into next section */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F1A]/60 via-transparent to-transparent" />

        {/* Content */}
        <div className="relative z-10 max-w-5xl mx-auto px-6 py-24 w-full">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-white/15 border border-white/30 text-white text-sm font-semibold px-4 py-1.5 rounded-full mb-6">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              For photographers &amp; studios
            </div>

            <h1 className="text-5xl sm:text-6xl font-extrabold text-white leading-tight mb-6 drop-shadow-md">
              Their memories.<br />Instantly connected.
            </h1>

            <p className="text-white/85 text-lg sm:text-xl leading-relaxed mb-7">
              Upload your images, send a beautiful smart gallery, and let clients locate every photo of themselves in seconds — powered by AI and a single selfie.
            </p>

            <p className="text-white font-bold text-lg mb-2">
              Selections made. Orders placed. Moments preserved.
            </p>
            <p className="text-white/80 text-base leading-relaxed mb-10">
              No apps. No hassle. Just effortless magic from shoot to doorstep.
            </p>

            <div className="flex items-center gap-4 flex-wrap">
              <a
                href="#get-started"
                className="bg-accent text-bg font-bold px-8 py-4 rounded-xl hover:bg-accent/90 transition-colors text-base shadow-lg shadow-accent/25"
              >
                Get your studio setup
              </a>
              <a
                href="#how-it-works"
                className="text-[#8BAAB8] hover:text-white text-base font-medium transition-colors"
              >
                See how it works →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Perfect for every shoot — 3D album cards */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-text-primary">Perfect for every shoot</h2>
          <p className="text-muted mt-2 text-sm">VayuStudios works for all kinds of professional photography</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
          {categoriesWithPhotos.map((cat) => (
            <a
              key={cat.slug}
              href={`/studio/showcase/${cat.slug}`}
              className="group block bg-card border border-border rounded-2xl p-4 sm:p-5 hover:border-accent/50 hover:-translate-y-1 transition-all duration-300 hover:shadow-xl hover:shadow-accent/10"
            >
              {/* 3D photo grid */}
              <div className="mb-4 overflow-hidden rounded-xl" style={{ perspective: '500px' }}>
                <div
                  className="grid grid-cols-3 gap-1 transition-transform duration-300"
                  style={{ transform: 'rotateX(12deg) rotateY(-6deg)', transformStyle: 'preserve-3d' }}
                >
                  {Array.from({ length: 6 }, (_, i) => {
                    const src = cat.photos[i] ?? null
                    return (
                      <div
                        key={i}
                        className={`aspect-square rounded-sm overflow-hidden relative ${cat.shades[i]}`}
                        style={{
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.3)',
                          transform: `translateZ(${i % 2 === 0 ? '4px' : '2px'})`,
                        }}
                      >
                        {src && (
                          <Image
                            src={src}
                            alt={`${cat.name} ${i + 1}`}
                            fill
                            className="object-cover"
                            sizes="80px"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Label */}
              <h3 className="font-bold text-text-primary text-sm sm:text-base group-hover:text-accent transition-colors leading-tight">
                {cat.name}
              </h3>
              <p className="text-muted text-xs mt-0.5">{cat.label}</p>
              <p className="text-accent/70 text-xs mt-2 font-medium group-hover:text-accent transition-colors">
                Explore gallery →
              </p>
            </a>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-card border-y border-border py-16">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold text-text-primary">How it works</h2>
            <p className="text-muted mt-2">Three steps from upload to print</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((step) => (
              <div key={step.number} className="bg-bg border border-border rounded-2xl p-6 space-y-3">
                <div className="text-4xl font-extrabold text-accent/20">{step.number}</div>
                <h3 className="font-bold text-text-primary text-lg">{step.title}</h3>
                <p className="text-muted text-sm leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-5xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold text-text-primary">Everything you need</h2>
          <p className="text-muted mt-2">Purpose-built for professional photographers</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-card border border-border rounded-2xl p-5 space-y-2">
              <div className="text-2xl">{f.icon}</div>
              <h3 className="font-semibold text-text-primary">{f.title}</h3>
              <p className="text-muted text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why VayuStudios */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-text-primary">Why photographers choose VayuStudios</h2>
        </div>
        <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
          {[
            { point: 'No client app downloads',         detail: 'OTP login on any phone browser' },
            { point: 'Originals stay safe',             detail: 'Clients only ever see watermarked previews' },
            { point: 'Direct to print workflow',        detail: 'Signed download links for your lab, no middleman' },
            { point: 'Editing requests built in',       detail: 'Clients flag specific photos and add comments' },
            { point: 'All shoots in one dashboard',     detail: 'Track status — Draft → Active → Selection received → Completed' },
            { point: 'India-first infrastructure',      detail: 'AWS Mumbai (ap-south-1), SNS OTP, INR pricing' },
          ].map(({ point, detail }) => (
            <div key={point} className="flex items-start gap-4 px-6 py-4">
              <span className="text-success font-bold text-lg flex-shrink-0">✓</span>
              <div>
                <div className="text-text-primary font-medium text-sm">{point}</div>
                <div className="text-muted text-xs mt-0.5">{detail}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing note */}
      <section className="max-w-3xl mx-auto px-4 pb-10">
        <div className="bg-accent/5 border border-accent/20 rounded-2xl p-8 text-center space-y-3">
          <h2 className="text-xl font-bold text-text-primary">Transparent pricing. No surprise bills.</h2>
          <p className="text-muted text-sm leading-relaxed max-w-xl mx-auto">
            VayuStudios is a managed service — we set up your studio, onboard your team, and support you throughout.
            Pricing is based on storage used and number of projects. Get in touch for a quote.
          </p>
          <a href="#get-started" className="inline-block text-accent text-sm font-semibold hover:underline mt-1">
            Contact us for pricing →
          </a>
        </div>
      </section>

      {/* Contact form */}
      <section id="get-started" className="max-w-2xl mx-auto px-4 pb-20">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-extrabold text-text-primary">Get your studio setup</h2>
          <p className="text-muted mt-2 text-sm">Fill in the form and we&apos;ll reach out within 24 hours.</p>
        </div>
        <EnquiryForm />
      </section>

      {/* Studio login link */}
      <div className="text-center pb-10">
        <p className="text-xs text-muted">
          Already have a studio account?{' '}
          <Link href="/studio/login" className="text-accent hover:underline">Sign in to VayuStudios →</Link>
        </p>
      </div>
    </main>
  )
}
