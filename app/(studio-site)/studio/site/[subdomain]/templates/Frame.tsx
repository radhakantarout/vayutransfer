// Template: Frame — Stark black & white editorial, gallery-first like a photo book
import type { StudioWebsite } from '@/types/studio'
import BookingForm from './BookingForm'
import Gallery from './Gallery'
import SocialIcons, { WhatsAppButton } from './SocialIcons'
import HeroBackground from './HeroMedia'
import Reveal from './Reveal'
import SiteNav from './SiteNav'
import Testimonials from './Testimonials'
import { translator, MULTI_SCRIPT_FONT_FALLBACK } from '@/lib/studio/i18n'
import { emphasisTextStyle } from '@/lib/studio/sectionStyle'
import type { WebsiteSectionKey } from '@/types/studio'

const BACKGROUND_PRESETS: Record<string, { bg: string; headerBg: string }> = {
  default: { bg: '#FFFFFF', headerBg: '#FFFFFF' },
  ivory:   { bg: '#FBF8F3', headerBg: '#FBF8F3' },
  concrete:{ bg: '#F2F1EF', headerBg: '#F2F1EF' },
}

export default function Frame({ site }: { site: StudioWebsite }) {
  const t = translator(site.language)
  const sx = (key: WebsiteSectionKey) => site.sectionStyles?.[key]
  const accent    = site.themeAccent ?? '#111111'
  const fontColor = site.fontColor   ?? '#111111'
  const bg = BACKGROUND_PRESETS[site.backgroundPreset ?? 'default'] ?? BACKGROUND_PRESETS.default
  const heroImg    = site.heroImageUrl || site.galleryPhotos[0]?.url
  const heroType   = site.heroImageUrl ? site.heroMediaType : site.galleryPhotos[0]?.type
  const heroPoster = site.heroImageUrl ? site.heroPosterUrl : site.galleryPhotos[0]?.thumbnailUrl
  const navLinks = [
    { label: t('navGallery', 'Gallery'), href: '#gallery' },
    { label: t('navAbout', 'About'), href: '#about' },
    ...(site.services.length > 0 ? [{ label: t('navServices', 'Services'), href: '#services' }] : []),
    ...(site.testimonials?.length ? [{ label: t('navReviews', 'Reviews'), href: '#reviews' }] : []),
    ...(site.bookingEnabled ? [{ label: t('navContact', 'Contact'), href: '#book' }] : []),
  ]

  return (
    <div className="min-h-screen" style={{ background: bg.bg, color: fontColor, fontFamily: `"Helvetica Neue", Helvetica, Arial, sans-serif, ${MULTI_SCRIPT_FONT_FALLBACK}` }}>

      {/* Nav */}
      <header data-preview-tab="content" className="fixed top-0 left-0 right-0 z-50 border-b border-black/10" style={{ background: bg.headerBg }}>
        <div className="px-6 sm:px-10 py-4 flex items-center justify-between">
          <span className="font-bold text-xs tracking-[0.3em] uppercase">{site.heroTitle}</span>
          <SiteNav links={navLinks} accent={accent} fontColor="#111111" panelBg={bg.bg}
            linkClassName="text-[11px] uppercase tracking-[0.25em]" />
        </div>
      </header>

      {/* Hero — short, editorial, lets the gallery dominate */}
      <section data-preview-tab="content" className="relative pt-16" style={{ height: '58vh', background: sx('hero')?.background }}>
        {heroImg ? (
          <>
            <div className="absolute inset-0" style={{ filter: 'grayscale(1) contrast(1.05)' }}>
              <HeroBackground url={heroImg} type={heroType} poster={heroPoster} />
            </div>
            <div className="absolute inset-0 bg-black/25" />
          </>
        ) : (
          <div className="absolute inset-0 bg-black" />
        )}
        <div className="absolute bottom-8 left-6 sm:left-10 right-6 sm:right-10 flex items-end justify-between gap-6">
          <h1 className="text-4xl sm:text-6xl font-bold uppercase tracking-tight leading-none text-white">{site.heroTitle}</h1>
          <p className="hidden sm:block text-xs uppercase tracking-widest text-white/70 max-w-[240px] text-right" style={emphasisTextStyle(sx('hero')?.emphasis)}>{site.heroSubtitle}</p>
        </div>
      </section>

      {/* Gallery — first, dominant */}
      <section id="gallery" data-preview-tab="gallery" className="py-16 px-6" style={{ background: sx('gallery')?.background }}>
        <Reveal className="max-w-6xl mx-auto">
          <div className="flex items-baseline justify-between mb-8">
            <p className="text-xs uppercase tracking-[0.3em] opacity-50">{t('navGallery', 'Selected Work')}</p>
            <span className="text-xs opacity-40">{site.galleryPhotos.length || '—'} {t('galleryPieces', 'pieces')}</span>
          </div>
          <Gallery style={site.galleryStyle} photos={site.galleryPhotos} studioName={site.heroTitle} accent={accent} fontColor={fontColor} language={site.language} />
        </Reveal>
      </section>

      {/* About */}
      <section id="about" data-preview-tab="content" className="py-24 px-6 border-t border-black/10" style={{ background: sx('about')?.background }}>
        <Reveal className="max-w-3xl mx-auto grid sm:grid-cols-[80px_1fr] gap-6">
          <p className="text-xs uppercase tracking-widest opacity-40" style={emphasisTextStyle(sx('about')?.emphasis)}>{t('sectionAboutHeading', 'About')}</p>
          <div>
            <p className="text-xl sm:text-2xl font-light leading-relaxed" style={emphasisTextStyle(sx('about')?.emphasis)}>{site.about}</p>
            {site.city && <p className="mt-6 text-xs uppercase tracking-widest opacity-40">{site.city}</p>}
            <SocialIcons instagram={site.socialLinks?.instagram} facebook={site.socialLinks?.facebook} youtube={site.socialLinks?.youtube} className="mt-6" />
          </div>
        </Reveal>
      </section>

      {/* Services */}
      {site.services.length > 0 && (
        <section id="services" data-preview-tab="services" className="py-24 px-6 border-t border-black/10" style={{ background: sx('services')?.background }}>
          <Reveal className="max-w-3xl mx-auto">
            <p className="text-xs uppercase tracking-widest opacity-40 mb-10" style={emphasisTextStyle(sx('services')?.emphasis)}>{t('sectionServicesHeading', 'Services')}</p>
            <div className="divide-y divide-black/10">
              {site.services.map((s, i) => (
                <div key={s.id} className="py-6 grid sm:grid-cols-[40px_1fr_auto] gap-4 items-baseline transition-all duration-300 hover:bg-black/[0.02] px-3 -mx-3 rounded-lg">
                  <span className="text-xs opacity-30 font-bold">0{i + 1}</span>
                  <div>
                    <h3 className="font-bold text-sm uppercase tracking-wider">{s.name}</h3>
                    <p className="text-sm opacity-60 mt-1">{s.description}</p>
                  </div>
                  {s.price && <span className="text-xs opacity-50 whitespace-nowrap">{s.price}</span>}
                </div>
              ))}
            </div>
          </Reveal>
        </section>
      )}

      {/* Testimonials */}
      {!!site.testimonials?.length && (
        <section id="reviews" data-preview-tab="testimonials" className="py-24 px-6 border-t border-black/10" style={{ background: sx('testimonials')?.background }}>
          <Reveal className="max-w-5xl mx-auto">
            <p className="text-xs uppercase tracking-widest opacity-40 mb-10" style={emphasisTextStyle(sx('testimonials')?.emphasis)}>{t('sectionReviewsHeading', 'Reviews')}</p>
            <Testimonials testimonials={site.testimonials} accent={accent} fontColor={fontColor} />
          </Reveal>
        </section>
      )}

      {/* Book */}
      <section id="book" data-preview-tab={site.bookingEnabled ? 'booking' : 'contact'} className="py-24 px-6 bg-black text-white" style={{ background: sx('book')?.background }}>
        <Reveal className="max-w-2xl mx-auto text-center">
          <p className="text-xs uppercase tracking-widest opacity-50 mb-4" style={emphasisTextStyle(sx('book')?.emphasis)}>{site.bookingEnabled ? t('sectionBookHeadingEnabled', 'Book a Session') : t('sectionBookHeadingDisabled', 'Contact')}</p>
          <h2 className="text-3xl font-light mb-10" style={emphasisTextStyle(sx('book')?.emphasis)}>{t('bookingIntro', "Let's work together")}</h2>
          {site.bookingEnabled
            ? <BookingForm subdomain={site.subdomain} message={site.bookingMessage} accentColor="#ffffff" textOnAccent="#111111" fontColor="#ffffff" language={site.language} />
            : (
              <div className="space-y-3 text-sm opacity-70">
                {site.contactEmail && <p>{site.contactEmail}</p>}
                {site.contactPhone && <p>{site.contactPhone}</p>}
                <WhatsAppButton number={site.whatsapp} language={site.language} />
              </div>
            )
          }
        </Reveal>
      </section>

      <footer data-preview-tab="contact" className="py-8 px-6 border-t border-black/10 text-center">
        <p className="text-xs opacity-40">{site.heroTitle} · {t('footerPoweredBy', 'Powered by')} VayuStudios</p>
      </footer>
    </div>
  )
}
