// Template: Zari — Ivory & gold, soft boutique luxury
import type { StudioWebsite } from '@/types/studio'
import BookingForm from './BookingForm'
import Gallery from './Gallery'
import SocialIcons, { WhatsAppButton } from './SocialIcons'
import HeroBackground from './HeroMedia'
import Reveal from './Reveal'
import SiteNav from './SiteNav'
import Testimonials from './Testimonials'
import { translator, MULTI_SCRIPT_FONT_FALLBACK } from '@/lib/studio/i18n'

const BACKGROUND_PRESETS: Record<string, { bg: string; alt: string }> = {
  default: { bg: '#FBF7F0', alt: '#F5EDE0' },
  rose:    { bg: '#FBF2EF', alt: '#F5E4DE' },
  sage:    { bg: '#F6F8F0', alt: '#EBEEDE' },
}

export default function Zari({ site }: { site: StudioWebsite }) {
  const t = translator(site.language)
  const accent    = site.themeAccent ?? '#C6A15B'
  const fontColor = site.fontColor   ?? '#4A3F35'
  const bg = BACKGROUND_PRESETS[site.backgroundPreset ?? 'default'] ?? BACKGROUND_PRESETS.default
  const heroImg    = site.heroImageUrl || site.galleryPhotos[0]?.url
  const heroType   = site.heroImageUrl ? site.heroMediaType : site.galleryPhotos[0]?.type
  const heroPoster = site.heroImageUrl ? site.heroPosterUrl : site.galleryPhotos[0]?.thumbnailUrl
  const navLinks = [
    { label: t('navGallery', 'Portfolio'), href: '#portfolio' },
    { label: t('navAbout', 'About'), href: '#about' },
    ...(site.services.length > 0 ? [{ label: t('navServices', 'Services'), href: '#services' }] : []),
    ...(site.testimonials?.length ? [{ label: t('navReviews', 'Reviews'), href: '#reviews' }] : []),
    ...(site.bookingEnabled ? [{ label: t('navBook', 'Enquire'), href: '#book' }] : []),
  ]

  return (
    <div className="min-h-screen" style={{ background: bg.bg, color: fontColor, fontFamily: `"Cormorant Garamond", Georgia, serif, ${MULTI_SCRIPT_FONT_FALLBACK}` }}>

      {/* Nav */}
      <header data-preview-tab="content" className="fixed top-0 left-0 right-0 z-50 backdrop-blur border-b" style={{ background: `${bg.bg}f2`, borderColor: `${accent}33` }}>
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-5 flex items-center justify-between">
          <span className="text-lg tracking-[0.2em] uppercase">{site.heroTitle}</span>
          <SiteNav links={navLinks} accent={accent} fontColor={fontColor} panelBg={bg.bg} linkClassName="text-xs uppercase tracking-[0.25em]" />
        </div>
      </header>

      {/* Hero */}
      <section data-preview-tab="content" className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.4em] mb-6" style={{ color: accent }}>Fine Art Photography</p>
          <h1 className="text-5xl sm:text-7xl font-light mb-6 leading-tight">{site.heroTitle}</h1>
          <p className="text-lg opacity-70 max-w-lg mx-auto mb-2">{site.heroSubtitle}</p>
          {site.tagline && <p className="text-sm italic opacity-50 mb-10">{site.tagline}</p>}
          {site.bookingEnabled && (
            <a href="#book" style={{ backgroundColor: accent }}
              className="inline-block px-10 py-3.5 text-xs uppercase tracking-[0.2em] text-white rounded-full hover:opacity-85 transition-opacity">
              {t('navBook', 'Enquire Now')}
            </a>
          )}
        </div>
        {heroImg && (
          <div className="max-w-3xl mx-auto mt-14 px-4">
            <div className="rounded-lg overflow-hidden shadow-2xl border-8 border-white" style={{ aspectRatio: '16/9', boxShadow: `0 30px 60px -20px ${accent}44` }}>
              <HeroBackground url={heroImg} type={heroType} poster={heroPoster} />
            </div>
          </div>
        )}
      </section>

      {/* Gallery */}
      <section id="portfolio" data-preview-tab="gallery" className="py-24 px-6">
        <Reveal className="max-w-6xl mx-auto">
          <p className="text-xs uppercase tracking-[0.35em] text-center mb-12" style={{ color: accent }}>{t('navGallery', 'Portfolio')}</p>
          <Gallery style={site.galleryStyle} photos={site.galleryPhotos} studioName={site.heroTitle} accent={accent} fontColor={fontColor} language={site.language} />
        </Reveal>
      </section>

      {/* About */}
      <section id="about" data-preview-tab="content" className="py-24 px-6" style={{ background: bg.alt }}>
        <Reveal className="max-w-3xl mx-auto text-center">
          <p className="text-4xl leading-none mb-6 opacity-30" style={{ color: accent }}>&ldquo;</p>
          <p className="text-2xl font-light leading-relaxed">{site.about}</p>
          {site.city && <p className="mt-8 text-xs uppercase tracking-widest opacity-50">{site.city}</p>}
        </Reveal>
      </section>

      {/* Services */}
      {site.services.length > 0 && (
        <section id="services" data-preview-tab="services" className="py-24 px-6">
          <Reveal className="max-w-3xl mx-auto">
            <p className="text-xs uppercase tracking-[0.35em] text-center mb-12" style={{ color: accent }}>{t('sectionServicesHeading', 'Services')}</p>
            <div className="divide-y" style={{ borderColor: `${accent}22` }}>
              {site.services.map(s => (
                <div key={s.id} className="py-7 flex items-center justify-between gap-6 transition-all duration-300 hover:pl-2">
                  <div>
                    <h3 className="text-lg font-light">{s.name}</h3>
                    <p className="text-sm opacity-60 mt-1">{s.description}</p>
                  </div>
                  {s.price && <span className="text-sm whitespace-nowrap" style={{ color: accent }}>{s.price}</span>}
                </div>
              ))}
            </div>
          </Reveal>
        </section>
      )}

      {/* Testimonials */}
      {!!site.testimonials?.length && (
        <section id="reviews" data-preview-tab="testimonials" className="py-24 px-6" style={{ background: bg.alt }}>
          <Reveal className="max-w-5xl mx-auto">
            <p className="text-xs uppercase tracking-[0.35em] text-center mb-12" style={{ color: accent }}>{t('sectionReviewsHeading', 'What Our Clients Say')}</p>
            <Testimonials testimonials={site.testimonials} accent={accent} fontColor={fontColor} />
          </Reveal>
        </section>
      )}

      {/* Book */}
      <section id="book" data-preview-tab={site.bookingEnabled ? 'booking' : 'contact'} className="py-24 px-6">
        <Reveal className="max-w-xl mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.35em] mb-4" style={{ color: accent }}>
            {site.bookingEnabled ? t('sectionBookHeadingEnabled', 'Reserve a Consultation') : t('sectionBookHeadingDisabled', 'Get in Touch')}
          </p>
          <h2 className="text-3xl font-light mb-10">{t('bookingIntro', "We'd love to hear your story")}</h2>
          {site.bookingEnabled
            ? <BookingForm subdomain={site.subdomain} message={site.bookingMessage} accentColor={accent} fontColor={fontColor} language={site.language} />
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

      <footer data-preview-tab="contact" className="py-8 px-6 text-center text-xs opacity-50 border-t" style={{ borderColor: `${accent}22` }}>
        <SocialIcons instagram={site.socialLinks?.instagram} facebook={site.socialLinks?.facebook} youtube={site.socialLinks?.youtube} className="justify-center mb-3" />
        <p>{site.heroTitle} · {t('footerPoweredBy', 'Powered by')} VayuStudios</p>
      </footer>
    </div>
  )
}
