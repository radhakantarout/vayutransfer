// Template: Monsoon — Deep blue & silver, modern geometric, corporate/portrait-leaning
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

const BACKGROUND_PRESETS: Record<string, { bg: string; alt: string; headerBg: string; heroMid: string; heroEnd: string }> = {
  default:  { bg: '#0B1622', alt: '#0F1D2E', headerBg: 'rgba(11,22,34,0.9)',  heroMid: 'rgba(11,22,34,0.3)',  heroEnd: 'rgba(11,22,34,0.5)' },
  charcoal: { bg: '#14171C', alt: '#1B1F26', headerBg: 'rgba(20,23,28,0.9)',  heroMid: 'rgba(20,23,28,0.3)',  heroEnd: 'rgba(20,23,28,0.5)' },
  plum:     { bg: '#170F1E', alt: '#1F1527', headerBg: 'rgba(23,15,30,0.9)', heroMid: 'rgba(23,15,30,0.3)', heroEnd: 'rgba(23,15,30,0.5)' },
}

export default function Monsoon({ site }: { site: StudioWebsite }) {
  const t = translator(site.language)
  const sx = (key: WebsiteSectionKey) => site.sectionStyles?.[key]
  const accent    = site.themeAccent ?? '#5B8FB9'
  const fontColor = site.fontColor   ?? '#EAF1F5'
  const bg = BACKGROUND_PRESETS[site.backgroundPreset ?? 'default'] ?? BACKGROUND_PRESETS.default
  const heroImg    = site.heroImageUrl || site.galleryPhotos[0]?.url
  const heroType   = site.heroImageUrl ? site.heroMediaType : site.galleryPhotos[0]?.type
  const heroPoster = site.heroImageUrl ? site.heroPosterUrl : site.galleryPhotos[0]?.thumbnailUrl
  const navLinks = [
    { label: t('navGallery', 'Work'), href: '#portfolio' },
    { label: t('navAbout', 'About'), href: '#about' },
    ...(site.services.length > 0 ? [{ label: t('navServices', 'Services'), href: '#services' }] : []),
    ...(site.testimonials?.length ? [{ label: t('navReviews', 'Reviews'), href: '#reviews' }] : []),
    { label: site.bookingEnabled ? t('navBook', 'Book') : t('navContact', 'Contact'), href: '#book' },
  ]

  return (
    <div className="min-h-screen" style={{ background: bg.bg, color: fontColor, fontFamily: `"Inter", "Helvetica Neue", sans-serif, ${MULTI_SCRIPT_FONT_FALLBACK}` }}>

      {/* Nav */}
      <header data-preview-tab="content" className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 sm:px-10 py-5" style={{ background: bg.headerBg }}>
        <span className="font-bold text-sm uppercase tracking-widest">{site.heroTitle}</span>
        <SiteNav links={navLinks} accent={accent} fontColor={fontColor} panelBg={bg.bg} linkClassName="text-xs font-semibold uppercase tracking-wider" />
      </header>

      {/* Hero — diagonal geometric split */}
      <section data-preview-tab="content" className="relative min-h-screen flex items-center px-6 sm:px-10 pt-20 overflow-hidden" style={{ background: sx('hero')?.background }}>
        {heroImg && (
          <div className="absolute inset-y-0 right-0 w-full sm:w-2/3" style={{ clipPath: 'polygon(18% 0, 100% 0, 100% 100%, 0% 100%)' }}>
            <HeroBackground url={heroImg} type={heroType} poster={heroPoster} className="w-full h-full object-cover" />
            <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${bg.bg} 0%, ${bg.heroMid} 30%, ${bg.heroEnd} 100%)` }} />
          </div>
        )}
        <div className="relative z-10 max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[0.3em] mb-5" style={{ color: accent }}>Photography &amp; Video</p>
          <h1 className="text-5xl sm:text-6xl font-black leading-tight mb-6">{site.heroTitle}</h1>
          <p className="text-base sm:text-lg opacity-70 mb-8 max-w-md" style={emphasisTextStyle(sx('hero')?.emphasis)}>{site.heroSubtitle}</p>
          {site.bookingEnabled && (
            <a href="#book" style={{ backgroundColor: accent, color: bg.bg }}
              className="inline-block px-9 py-3.5 text-sm font-bold uppercase tracking-wider rounded-lg hover:opacity-85 transition-opacity">
              {t('sectionBookHeadingEnabled', 'Book a Session')}
            </a>
          )}
        </div>
      </section>

      {/* Gallery */}
      <section id="portfolio" data-preview-tab="gallery" className="py-24 px-6" style={{ background: sx('gallery')?.background }}>
        <Reveal className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 justify-center mb-12">
            <span className="w-8 h-1 rounded-full" style={{ background: accent }} />
            <p className="text-xs uppercase tracking-[0.3em] opacity-60">{t('navGallery', 'Selected Work')}</p>
          </div>
          <Gallery style={site.galleryStyle} photos={site.galleryPhotos} studioName={site.heroTitle} accent={accent} fontColor={fontColor} language={site.language} />
        </Reveal>
      </section>

      {/* About */}
      <section id="about" data-preview-tab="content" className="py-24 px-6" style={{ background: sx('about')?.background ?? bg.alt }}>
        <Reveal className="max-w-4xl mx-auto grid md:grid-cols-[1fr_1px_1fr] gap-10 items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] mb-4" style={{ color: accent, ...emphasisTextStyle(sx('about')?.emphasis) }}>{t('sectionAboutHeading', 'About Us')}</p>
            <p className="text-lg leading-relaxed opacity-80" style={emphasisTextStyle(sx('about')?.emphasis)}>{site.about}</p>
            {site.city && <p className="mt-6 text-xs uppercase tracking-widest opacity-50">{site.city}</p>}
          </div>
          <div className="hidden md:block h-full" style={{ background: `${accent}33` }} />
          <SocialIcons instagram={site.socialLinks?.instagram} facebook={site.socialLinks?.facebook} youtube={site.socialLinks?.youtube}
            className="flex-col items-start gap-3" iconClassName="border rounded-lg px-5 py-3 hover:border-opacity-60 transition-colors" />
        </Reveal>
      </section>

      {/* Services */}
      {site.services.length > 0 && (
        <section id="services" data-preview-tab="services" className="py-24 px-6" style={{ background: sx('services')?.background }}>
          <Reveal className="max-w-5xl mx-auto">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-center mb-12" style={{ color: accent, ...emphasisTextStyle(sx('services')?.emphasis) }}>{t('sectionServicesHeading', 'What We Offer')}</p>
            <div className="grid sm:grid-cols-3 gap-6">
              {site.services.map(s => (
                <div key={s.id} className="rounded-xl p-6 transition-all duration-300 hover:-translate-y-1.5"
                  style={{ background: bg.alt, borderLeft: `3px solid ${accent}` }}>
                  <h3 className="font-bold mb-2 text-sm uppercase tracking-wide">{s.name}</h3>
                  <p className="text-sm opacity-60 leading-relaxed mb-3">{s.description}</p>
                  {s.price && <p className="text-xs font-bold" style={{ color: accent }}>{s.price}</p>}
                </div>
              ))}
            </div>
          </Reveal>
        </section>
      )}

      {/* Testimonials */}
      {!!site.testimonials?.length && (
        <section id="reviews" data-preview-tab="testimonials" className="py-24 px-6" style={{ background: sx('testimonials')?.background ?? bg.alt }}>
          <Reveal className="max-w-5xl mx-auto">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-center mb-12" style={{ color: accent, ...emphasisTextStyle(sx('testimonials')?.emphasis) }}>{t('sectionReviewsHeading', 'Client Reviews')}</p>
            <Testimonials testimonials={site.testimonials} accent={accent} fontColor={fontColor} />
          </Reveal>
        </section>
      )}

      {/* Book */}
      <section id="book" data-preview-tab={site.bookingEnabled ? 'booking' : 'contact'} className="py-24 px-6" style={{ background: sx('book')?.background }}>
        <Reveal className="max-w-2xl mx-auto text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] mb-4" style={{ color: accent, ...emphasisTextStyle(sx('book')?.emphasis) }}>
            {site.bookingEnabled ? t('sectionBookHeadingEnabled', 'Book a Session') : t('sectionBookHeadingDisabled', 'Contact')}
          </p>
          <h2 className="text-3xl font-black uppercase mb-10" style={emphasisTextStyle(sx('book')?.emphasis)}>{t('bookingIntro', "Let's create together")}</h2>
          {site.bookingEnabled
            ? <BookingForm subdomain={site.subdomain} message={site.bookingMessage} accentColor={accent} textOnAccent={bg.bg} fontColor={fontColor} language={site.language} />
            : (
              <div className="space-y-3 text-sm opacity-70">
                {site.contactEmail && <p>✉ {site.contactEmail}</p>}
                {site.contactPhone && <p>☎ {site.contactPhone}</p>}
                <WhatsAppButton number={site.whatsapp} language={site.language} />
              </div>
            )
          }
        </Reveal>
      </section>

      <footer data-preview-tab="contact" className="py-8 px-6 text-center text-xs opacity-40 border-t" style={{ borderColor: `${accent}22` }}>
        {site.heroTitle} · {t('footerPoweredBy', 'Powered by')} VayuStudios
      </footer>
    </div>
  )
}
