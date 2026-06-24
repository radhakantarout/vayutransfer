import Link from 'next/link'

// 3 columns of portrait photos for the hero floating grid (picsum deterministic seeds)
const HERO_COLS = [
  ['photo/1011/300/420', 'photo/1025/300/380', 'photo/1040/300/420', 'photo/1062/300/360'],
  ['photo/1031/300/380', 'photo/1041/300/420', 'photo/1055/300/360', 'photo/1070/300/420', 'photo/1080/300/380'],
  ['photo/1015/300/420', 'photo/1035/300/360', 'photo/1059/300/420', 'photo/1075/300/380'],
]

// Small thumbs for the in-page mockup cards
const GALLERY_THUMBS = [
  'photo/1011/140/140', 'photo/1025/140/140', 'photo/1040/140/140',
  'photo/1031/140/140', 'photo/1041/140/140', 'photo/1055/140/140',
]
const SELECT_THUMBS = [
  { src: 'photo/1015/200/200', chosen: true  },
  { src: 'photo/1035/200/200', chosen: false },
  { src: 'photo/1059/200/200', chosen: true  },
  { src: 'photo/1075/200/200', chosen: false },
]

const TRUST_PILLS = [
  'Private gallery links',
  'RAW file support',
  'Client photo selection',
  'Auto-expiry',
  'Watermark protection',
  'Made for India',
]

const RAW_CARDS = [
  {
    icon: '📁',
    title: 'RAW + Edited support',
    body: 'Upload RAW files, JPEGs, PNGs — anything. Clients download full-resolution originals in one click.',
  },
  {
    icon: '🔒',
    title: 'Watermark protection',
    body: 'All previews carry your watermark automatically. Clients only get clean files after you approve download.',
  },
  {
    icon: '⏱',
    title: 'Same-day delivery',
    body: 'Upload straight from the shoot. Share a link in minutes. No waiting, no Drive folders, no WhatsApp.',
  },
  {
    icon: '🔗',
    title: 'Expiring secure links',
    body: 'Every gallery link has a built-in expiry date and download limit. You stay in control after you hit send.',
  },
]

export default function StudioHomePage() {
  return (
    <>
      {/* ── 1. HERO ─────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden bg-nav min-h-[calc(100vh-56px)] flex items-center"
        style={{ backgroundColor: 'rgb(15 32 64)' }}
      >
        {/* Floating photo grid — right half, decorative */}
        <div
          aria-hidden="true"
          className="absolute right-0 top-0 bottom-0 w-[52%] hidden md:flex gap-3 px-6 py-4 overflow-hidden pointer-events-none"
        >
          {HERO_COLS.map((col, ci) => (
            <div
              key={ci}
              className={`flex flex-col gap-3 flex-1 ${
                ci === 0 ? 'float-col-1 mt-10' :
                ci === 1 ? 'float-col-2 -mt-6' :
                           'float-col-3 mt-20'
              }`}
            >
              {col.map((path, pi) => (
                <img
                  key={pi}
                  src={`https://picsum.photos/${path}`}
                  alt=""
                  loading="lazy"
                  className={`w-full rounded-xl object-cover shadow-xl ${
                    ci % 2 === 0 ? 'rotate-[-1.5deg]' : 'rotate-[1deg]'
                  }`}
                  style={{ opacity: 0.55 }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Gradient overlay: solid navy left → transparent right */}
        <div
          aria-hidden="true"
          className="absolute inset-0 hidden md:block"
          style={{
            background: 'linear-gradient(to right, rgb(15 32 64) 40%, rgb(15 32 64 / 0.85) 60%, rgb(15 32 64 / 0.15) 100%)',
          }}
        />
        {/* Mobile overlay */}
        <div
          aria-hidden="true"
          className="absolute inset-0 md:hidden"
          style={{ background: 'rgb(15 32 64 / 0.95)' }}
        />

        {/* Hero content */}
        <div className="relative z-10 w-full max-w-6xl mx-auto px-6 py-20 md:w-[52%]">
          <div className="inline-flex items-center gap-2 bg-accent/15 border border-accent/30 rounded-full px-4 py-1.5 text-accent text-xs font-semibold mb-6 animate-fade-up">
            For professional photographers · India
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] mb-5 animate-fade-up">
            Your gallery.<br />
            <span style={{ color: 'rgb(0 153 204)' }}>Their moment.</span>
          </h1>

          <p className="text-lg text-white/65 leading-relaxed max-w-md mb-8 animate-fade-up-delay">
            Share private, branded photo galleries with clients. Let them select
            favourites, download full-res files, and feel the difference a
            professional delivery makes.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 animate-fade-up-delay-2">
            <Link
              href="/studio/register"
              className="inline-flex items-center justify-center gap-2 font-bold px-7 py-3.5 rounded-xl text-base transition-all"
              style={{ backgroundColor: 'rgb(0 153 204)', color: 'rgb(15 32 64)' }}
            >
              Get Started Free
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <a
              href="#features"
              className="inline-flex items-center justify-center gap-2 font-semibold px-7 py-3.5 rounded-xl text-base border border-white/20 text-white/80 hover:border-white/40 hover:text-white transition-all"
            >
              See how it works
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </a>
          </div>

          {/* Social proof micro-line */}
          <p className="mt-10 text-sm text-white/35 flex items-center gap-2">
            <span className="flex gap-1">
              {[1,2,3,4,5].map((s) => (
                <svg key={s} className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="rgb(0 153 204)">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                </svg>
              ))}
            </span>
            Loved by photographers across India
          </p>
        </div>
      </section>

      {/* ── 2. TRUST BAR ────────────────────────────────────────────────── */}
      <section className="bg-card border-y border-border py-4 overflow-hidden">
        <div className="flex items-center justify-center flex-wrap gap-x-8 gap-y-2 px-6">
          {TRUST_PILLS.map((label, i) => (
            <span key={i} className="flex items-center gap-2 text-sm text-muted whitespace-nowrap">
              <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 20 20" fill="rgb(0 153 204)">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
              </svg>
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* ── 3. FEATURE: PRIVATE GALLERIES ───────────────────────────────── */}
      <section id="features" className="py-20 bg-bg">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">

          {/* Text */}
          <div className="space-y-5 order-2 md:order-1">
            <div className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full border"
              style={{ color: 'rgb(0 153 204)', borderColor: 'rgb(0 153 204 / 0.3)', background: 'rgb(0 153 204 / 0.08)' }}>
              Client Galleries
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-text-primary leading-tight">
              Share photos like a pro.<br />Not a download link.
            </h2>
            <p className="text-muted text-base leading-relaxed">
              Every shoot gets its own private, password-protected gallery. Your clients see a
              clean, branded experience — not a messy Drive folder or a WeTransfer link
              that expires in 7 days and embarrasses you both.
            </p>
            <ul className="space-y-2.5">
              {[
                'Password-protected per-gallery access',
                'Download limit and auto-expiry you control',
                'Full-resolution ZIP in one click',
                'Mobile-optimised — no app download needed',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-muted">
                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="rgb(0 153 204)">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Gallery mockup */}
          <div className="order-1 md:order-2 flex justify-center">
            <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border border-border bg-card">
              {/* Fake browser bar */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-bg">
                <div className="flex gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-danger/60"/>
                  <span className="w-3 h-3 rounded-full bg-yellow-400/60"/>
                  <span className="w-3 h-3 rounded-full bg-success/60"/>
                </div>
                <div className="flex-1 bg-border/40 rounded-md px-3 py-1 text-xs text-muted truncate text-center">
                  studio.vayutransfer.com/gallery/ravi-wedding
                </div>
              </div>
              {/* Gallery header */}
              <div className="px-4 pt-4 pb-2 border-b border-border flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-text-primary">Ravi & Sunita Wedding</div>
                  <div className="text-xs text-muted">84 photos · By Arjun Photography</div>
                </div>
                <button className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: 'rgb(0 153 204 / 0.12)', color: 'rgb(0 153 204)' }}>
                  Download ↓
                </button>
              </div>
              {/* Photo grid */}
              <div className="grid grid-cols-3 gap-0.5 p-0.5">
                {GALLERY_THUMBS.map((path, i) => (
                  <img
                    key={i}
                    src={`https://picsum.photos/${path}`}
                    alt=""
                    className="w-full aspect-square object-cover"
                    loading="lazy"
                  />
                ))}
              </div>
              <div className="px-4 py-3 text-center">
                <span className="text-xs text-muted">Showing 6 of 84 photos</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. FEATURE: CLIENT SELECTION ────────────────────────────────── */}
      <section className="py-20 bg-card border-y border-border">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">

          {/* Selection mockup */}
          <div className="flex justify-center">
            <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border border-border bg-bg">
              <div className="px-4 pt-4 pb-3 border-b border-border">
                <div className="text-sm font-bold text-text-primary">Select your favourites</div>
                <div className="text-xs text-muted mt-0.5">Tap photos to select · 2 of 84 selected</div>
              </div>
              <div className="grid grid-cols-2 gap-1 p-1">
                {SELECT_THUMBS.map(({ src, chosen }, i) => (
                  <div key={i} className="relative">
                    <img
                      src={`https://picsum.photos/${src}`}
                      alt=""
                      className={`w-full aspect-square object-cover rounded-lg transition-all ${chosen ? 'brightness-75' : ''}`}
                      loading="lazy"
                    />
                    {chosen && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-lg"
                        style={{ background: 'rgb(0 153 204 / 0.25)', border: '2.5px solid rgb(0 153 204)' }}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shadow-lg"
                          style={{ background: 'rgb(0 153 204)' }}>
                          <svg className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="white">
                            <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"/>
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 flex items-center justify-between border-t border-border">
                <span className="text-xs text-muted">2 selected</span>
                <button className="text-xs font-bold px-4 py-1.5 rounded-lg text-white"
                  style={{ background: 'rgb(0 153 204)' }}>
                  Submit Selection →
                </button>
              </div>
            </div>
          </div>

          {/* Text */}
          <div className="space-y-5">
            <div className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full border"
              style={{ color: 'rgb(0 153 204)', borderColor: 'rgb(0 153 204 / 0.3)', background: 'rgb(0 153 204 / 0.08)' }}>
              Client Selection
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-text-primary leading-tight">
              Let clients choose.<br />No WhatsApp screenshots.
            </h2>
            <p className="text-muted text-base leading-relaxed">
              Clients browse their gallery and heart the photos they love. You receive a
              clean selection report — no back-and-forth, no
              &ldquo;screenshot with the red circles,&rdquo; no miscommunication.
              Edit exactly what they chose.
            </p>
            <ul className="space-y-2.5">
              {[
                'Heart-based selection UI — zero learning curve for clients',
                'Instant selection report emailed to you',
                'Clients can revise selections before you start editing',
                'Per-project selection limits you define',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-muted">
                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="rgb(0 153 204)">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── 5. FEATURE CARDS: RAW / WATERMARK / EXPIRY / DELIVERY ──────── */}
      <section className="py-20" style={{ backgroundColor: 'rgb(15 32 64)' }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <div className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full border mb-4"
              style={{ color: 'rgb(0 153 204)', borderColor: 'rgb(0 153 204 / 0.3)', background: 'rgb(0 153 204 / 0.1)' }}>
              Everything you need
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight">
              Professional delivery.<br />Without the complexity.
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {RAW_CARDS.map((card) => (
              <div
                key={card.title}
                className="rounded-2xl p-6 border hover:border-accent/40 transition-colors group"
                style={{ background: 'rgb(255 255 255 / 0.04)', borderColor: 'rgb(255 255 255 / 0.08)' }}
              >
                <div className="text-3xl mb-4">{card.icon}</div>
                <h3 className="text-base font-bold text-white mb-2 group-hover:text-accent transition-colors">
                  {card.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'rgb(255 255 255 / 0.5)' }}>
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. HOW IT WORKS ─────────────────────────────────────────────── */}
      <section className="py-20 bg-bg">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full border mb-4"
            style={{ color: 'rgb(0 153 204)', borderColor: 'rgb(0 153 204 / 0.3)', background: 'rgb(0 153 204 / 0.08)' }}>
            How it works
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-text-primary mb-12">
            From shoot to delivery in 3 steps
          </h2>
          <div className="grid sm:grid-cols-3 gap-8 text-left">
            {[
              {
                step: '01',
                title: 'Upload your photos',
                body: 'Drag-and-drop RAW or edited files into a new project. VayuStudio organises everything automatically.',
              },
              {
                step: '02',
                title: 'Share the gallery link',
                body: 'One click sends a branded, password-protected gallery link to your client\'s email. No sign-up needed for them.',
              },
              {
                step: '03',
                title: 'Client selects & you deliver',
                body: 'Client hearts their favourites. You get the selection report. Deliver the final files — done.',
              },
            ].map(({ step, title, body }) => (
              <div key={step} className="relative">
                <div
                  className="text-5xl font-black mb-3 leading-none select-none"
                  style={{ color: 'rgb(0 153 204 / 0.15)' }}
                >
                  {step}
                </div>
                <h3 className="text-base font-bold text-text-primary mb-2">{title}</h3>
                <p className="text-sm text-muted leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. FINAL CTA ────────────────────────────────────────────────── */}
      <section
        className="py-24 text-center relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, rgb(0 80 120) 0%, rgb(15 32 64) 40%, rgb(0 40 80) 100%)' }}
      >
        {/* Subtle grid texture */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="relative z-10 max-w-2xl mx-auto px-6">
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white leading-tight mb-4">
            Built for Indian photographers.<br />
            <span style={{ color: 'rgb(0 198 255)' }}>Start for free today.</span>
          </h2>
          <p className="text-white/55 text-base mb-10 leading-relaxed">
            Stop sending Google Drive links. Stop taking WhatsApp screenshots.
            Give your clients the gallery experience they deserve — and give yourself
            the workflow you&apos;ve always wanted.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/studio/register"
              className="inline-flex items-center justify-center gap-2 font-bold px-8 py-4 rounded-xl text-base transition-all shadow-lg hover:shadow-accent/30 hover:scale-105"
              style={{ backgroundColor: 'rgb(0 153 204)', color: 'white' }}
            >
              Create your studio — Free
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <a
              href="https://vayutransfer.com"
              className="inline-flex items-center justify-center gap-2 font-semibold px-8 py-4 rounded-xl text-base border border-white/15 text-white/70 hover:border-white/30 hover:text-white transition-all"
            >
              Back to VayuTransfer
            </a>
          </div>
          <p className="mt-6 text-xs text-white/30">No credit card required · No setup fees · Cancel anytime</p>
        </div>
      </section>
    </>
  )
}
