import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import EnquiryForm from './EnquiryForm'
import ProductLifecycle from '@/components/studio/ProductLifecycle'
import GoogleIcon from '@/components/studio/GoogleIcon'
import { getPhotosForSlug, getSamplePhotos } from '@/lib/studio/sampleImages'

export const metadata: Metadata = {
  title: 'VayuStudios — Professional Photo Galleries for Photographers',
  description: 'Upload photos, share a secure gallery with clients, let them select favourites, and send straight to print. Built for Indian wedding and event photographers.',
}


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
  const uploadSamples  = getSamplePhotos()
  // Reuse wedding photos (already loaded) for the step 2 / 3 / 4 mockups
  const mockupPhotos   = categoriesWithPhotos[0]?.photos ?? []

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
            <div className="inline-flex items-center gap-2 bg-accent/20 border border-accent/60 text-accent text-sm font-bold px-4 py-1.5 rounded-full mb-6">
              <span className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
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

      {/* ── How it works ─────────────────────────────────────────── */}
      <section id="how-it-works" className="bg-card border-y border-border py-20">
        <ProductLifecycle variant="grid" uploadSamples={uploadSamples} mockupPhotos={mockupPhotos} />
      </section>

      {/* ── Stats bar ───────────────────────────────────────────────── */}
      <section className="border-b border-border bg-bg">
        <div className="max-w-5xl mx-auto px-4 py-10 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {[
            { value: '500+',    label: 'Photographers onboarded' },
            { value: '50,000+', label: 'Photos delivered' },
            { value: '6',       label: 'Event categories' },
            { value: '100%',    label: 'Originals secured' },
          ].map(({ value, label }) => (
            <div key={label}>
              <div className="text-3xl font-extrabold text-accent">{value}</div>
              <div className="text-muted text-xs mt-1">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features grid ───────────────────────────────────────────── */}
      <section id="features" className="max-w-6xl mx-auto px-4 py-20">
        <div className="text-center mb-14">
          <span className="inline-block text-accent text-xs font-bold uppercase tracking-widest mb-3 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">
            Built for pros
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-text-primary mt-2">Everything you need</h2>
          <p className="text-muted mt-3 text-sm max-w-md mx-auto">Purpose-built for professional photographers delivering to Indian clients.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            {
              icon: (
                <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="3" width="18" height="18" rx="2"/><path strokeLinecap="round" d="M9 9l6 6M15 9l-6 6"/></svg>
              ),
              color: 'bg-rose-500/10 border-rose-500/20',
              title: 'Watermarked previews',
              body: 'Clients see beautiful previews — your originals are never exposed.',
              badge: 'Auto-generated',
            },
            {
              icon: (
                <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
              ),
              color: 'bg-accent/10 border-accent/20',
              title: 'OTP client login',
              body: 'No passwords. No app install. Clients log in with their phone number in seconds.',
              badge: 'India-first',
            },
            {
              icon: (
                <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a4 4 0 01-1.414.828l-4.243 1.414 1.414-4.243A4 4 0 019 13z"/></svg>
              ),
              color: 'bg-yellow-500/10 border-yellow-500/20',
              title: 'Editing requests',
              body: 'Clients flag photos for retouching and add comments. You see every note.',
              badge: 'Per-photo',
            },
            {
              icon: (
                <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              ),
              color: 'bg-green-500/10 border-green-500/20',
              title: 'Secure print downloads',
              body: '7-day secure download links for your print lab. No middleman, no risk.',
              badge: 'Signed URL',
            },
            {
              icon: (
                <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
              ),
              color: 'bg-violet-500/10 border-violet-500/20',
              title: 'Multi-shoot dashboard',
              body: 'All your projects in one place. Track: Draft → Active → Selections in → Delivered.',
              badge: 'Live status',
            },
            {
              icon: (
                <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M2 12h4M18 12h4M12 2v4M12 18v4"/></svg>
              ),
              color: 'bg-orange-500/10 border-orange-500/20',
              title: 'Built for India',
              body: 'Mumbai-based servers, phone OTP, INR pricing. Fast and reliable for every Indian client.',
              badge: 'India servers',
            },
          ].map((f) => (
            <div key={f.title} className="group bg-card border border-border rounded-2xl p-5 hover:border-accent/40 hover:-translate-y-0.5 transition-all duration-300 space-y-3">
              <div className="flex items-center justify-between">
                <div className={`w-9 h-9 rounded-xl border ${f.color} flex items-center justify-center`}>
                  {f.icon}
                </div>
                <span className="text-[10px] text-muted bg-border/60 px-2 py-0.5 rounded-full">{f.badge}</span>
              </div>
              <h3 className="font-bold text-text-primary group-hover:text-accent transition-colors">{f.title}</h3>
              <p className="text-muted text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Old way vs VayuStudios ──────────────────────────────────── */}
      <section className="bg-card border-y border-border py-20">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-12">
            <span className="inline-block text-accent text-xs font-bold uppercase tracking-widest mb-3 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">
              Why switch
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-text-primary mt-2">The old way vs VayuStudios</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Old way */}
            <div className="bg-bg border border-border rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <span className="w-2 h-2 rounded-full bg-danger" />
                <span className="text-sm font-bold text-muted">The old way</span>
              </div>
              <ul className="space-y-3">
                {[
                  'WhatsApp full-res photos — storage bloat, no backup',
                  'Google Drive links — no control once shared',
                  'Client writes selections in a notebook or WhatsApp',
                  'You manually sort through feedback and match photo numbers',
                  'Print lab gets wrong files — resend, delay, frustration',
                  'Client\'s phone gallery fills up with unfinished previews',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-muted">
                    <svg className="w-4 h-4 text-danger/60 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/></svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {/* VayuStudios */}
            <div className="bg-bg border border-accent/30 rounded-2xl p-6 shadow-lg shadow-accent/5">
              <div className="flex items-center gap-2 mb-5">
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                <span className="text-sm font-bold text-accent">With VayuStudios</span>
              </div>
              <ul className="space-y-3">
                {[
                  'Originals stored securely in the cloud — watermarks auto-generated',
                  'One private link — revoke or expire anytime',
                  'Client selects directly in the gallery with a tap',
                  'You see every selection and comment live on your dashboard',
                  'Signed 7-day link sent directly to your print lab',
                  'Client sees polished gallery — no file clutter',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-text-primary">
                    <svg className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M5 13l4 4L19 7"/></svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-4 py-20">
        <div className="text-center mb-10">
          <span className="inline-block text-accent text-xs font-bold uppercase tracking-widest mb-3 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">
            Pricing
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-text-primary mt-2">Simple, transparent pricing</h2>
          <p className="text-muted mt-3 text-sm">No hidden fees. No per-seat charges. Just your studio, your clients.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              plan: 'Starter',
              price: 'Contact us',
              desc: 'Perfect for solo photographers just getting started.',
              features: ['Up to 5 active projects', 'Watermarked previews', 'Client OTP login', 'Editing requests', '5 GB storage'],
              accent: false,
            },
            {
              plan: 'Studio',
              price: 'Contact us',
              desc: 'For busy studios handling multiple shoots a month.',
              features: ['Unlimited projects', 'Everything in Starter', 'Multi-user dashboard', 'Priority support', '50 GB storage'],
              accent: true,
            },
            {
              plan: 'Enterprise',
              price: 'Custom',
              desc: 'Large studios, franchise chains, or high-volume labs.',
              features: ['Custom storage', 'Custom branding', 'Dedicated onboarding', 'SLA support', 'API access'],
              accent: false,
            },
          ].map((tier) => (
            <div key={tier.plan} className={`rounded-2xl p-6 border flex flex-col gap-4 ${
              tier.accent
                ? 'bg-accent/5 border-accent/40 shadow-xl shadow-accent/10 scale-[1.02]'
                : 'bg-card border-border'
            }`}>
              {tier.accent && (
                <span className="self-start text-[10px] font-bold text-[#0B0F1A] bg-accent px-2.5 py-0.5 rounded-full">Most popular</span>
              )}
              <div>
                <h3 className={`text-lg font-extrabold ${tier.accent ? 'text-accent' : 'text-text-primary'}`}>{tier.plan}</h3>
                <div className="text-2xl font-extrabold text-text-primary mt-1">{tier.price}</div>
                <p className="text-muted text-xs mt-1">{tier.desc}</p>
              </div>
              <ul className="space-y-2 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-muted">
                    <svg className={`w-3.5 h-3.5 flex-shrink-0 ${tier.accent ? 'text-accent' : 'text-muted'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M5 13l4 4L19 7"/></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="#get-started"
                className={`text-center text-sm font-bold py-3 rounded-xl transition-colors ${
                  tier.accent
                    ? 'bg-accent text-[#0B0F1A] hover:bg-accent/90'
                    : 'border border-border text-text-primary hover:border-accent/50 hover:text-accent'
                }`}
              >
                Get started →
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA + Enquiry form ──────────────────────────────────────── */}
      <section id="get-started" className="relative overflow-hidden border-t border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-transparent pointer-events-none" />
        <div className="relative max-w-2xl mx-auto px-4 py-20">
          <div className="text-center mb-10">
            <span className="inline-block text-accent text-xs font-bold uppercase tracking-widest mb-3 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">
              Get started
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-text-primary mt-2">Set up your studio today</h2>
            <p className="text-muted mt-3 text-sm">
              Fill in the form — we&apos;ll set up your studio, onboard your team, and have you delivering galleries within 24 hours.
            </p>
            <div className="flex items-center justify-center gap-6 mt-5 text-xs text-muted">
              <span className="flex items-center gap-1.5"><svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M5 13l4 4L19 7"/></svg>Free setup</span>
              <span className="flex items-center gap-1.5"><svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M5 13l4 4L19 7"/></svg>No credit card</span>
              <span className="flex items-center gap-1.5"><svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M5 13l4 4L19 7"/></svg>Response in 24h</span>
            </div>
          </div>
          <a
            href="/studio/api/auth/google?next=/studio/dashboard"
            className="flex items-center justify-center gap-2.5 w-full bg-card border border-border rounded-xl py-3 text-sm font-semibold text-text-primary hover:border-accent/40 transition-colors mb-6"
          >
            <GoogleIcon />
            Create with Google
          </a>
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted whitespace-nowrap">Or fill in your details</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <EnquiryForm />
          <p className="text-center text-xs text-muted mt-8">
            Already have an account?{' '}
            <Link href="/studio/login" className="text-accent hover:underline">Sign in to VayuStudios →</Link>
          </p>
        </div>
      </section>
    </main>
  )
}
