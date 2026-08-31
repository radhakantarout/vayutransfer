// Template: Bloom — Pastel, feminine, airy, romantic
import type { StudioWebsite } from '@/types/studio'
import BookingForm from './BookingForm'
import Gallery from './Gallery'
import SocialIcons, { WhatsAppButton } from './SocialIcons'
import HeroBackground from './HeroMedia'
import Reveal from './Reveal'
import SiteNav from './SiteNav'
import Testimonials from './Testimonials'
import { translator, MULTI_SCRIPT_FONT_FALLBACK } from '@/lib/studio/i18n'

const BACKGROUND_PRESETS: Record<string, {
  bg: string; border: string; heroFrom: string; heroMid: string; heroTo: string
  altFrom: string; altTo: string; cardBg: string; circle2: string
}> = {
  default:  { bg: '#FDF8F6', border: '#F0DDD8', heroFrom: '#FDF0EE', heroMid: '#F9E8E8', heroTo: '#F5ECEF', altFrom: '#FDF0EE', altTo: '#FDF8F6', cardBg: '#FDF0EE', circle2: '#F9BCC4' },
  lavender: { bg: '#FAF8FD', border: '#E6DFF0', heroFrom: '#F3EFFB', heroMid: '#ECE5F8', heroTo: '#F1EEF7', altFrom: '#F3EFFB', altTo: '#FAF8FD', cardBg: '#F3EFFB', circle2: '#D8C7EE' },
  mint:     { bg: '#F7FBF9', border: '#DCEEE6', heroFrom: '#EBF7F1', heroMid: '#E1F3EA', heroTo: '#EAF5EF', altFrom: '#EBF7F1', altTo: '#F7FBF9', cardBg: '#EBF7F1', circle2: '#B9E4CE' },
}

export default function Bloom({ site }: { site: StudioWebsite }) {
  const t = translator(site.language)
  const accent    = site.themeAccent ?? '#D4849A'
  const fontColor = site.fontColor   ?? '#3D2B2B'
  const bg = BACKGROUND_PRESETS[site.backgroundPreset ?? 'default'] ?? BACKGROUND_PRESETS.default
  const heroImg    = site.heroImageUrl || site.galleryPhotos[0]?.url
  const heroType   = site.heroImageUrl ? site.heroMediaType : site.galleryPhotos[0]?.type
  const heroPoster = site.heroImageUrl ? site.heroPosterUrl : site.galleryPhotos[0]?.thumbnailUrl
  const navLinks = [
    { label: t('navGallery', 'Gallery'), href: '#gallery' },
    { label: t('navAbout', 'About'), href: '#about' },
    ...(site.services.length > 0 ? [{ label: t('navServices', 'Services'), href: '#services' }] : []),
    ...(site.testimonials?.length ? [{ label: t('navReviews', 'Reviews'), href: '#reviews' }] : []),
    ...(site.bookingEnabled ? [{ label: t('navBook', 'Book'), href: '#book' }] : []),
  ]

  return (
    <div className="min-h-screen" style={{ background: bg.bg, color: fontColor, fontFamily: `"Cormorant Garamond", "Times New Roman", serif, ${MULTI_SCRIPT_FONT_FALLBACK}` }}>

      {/* Nav */}
      <header data-preview-tab="content" className="py-5 px-8 text-center" style={{ borderBottom: `1px solid ${bg.border}` }}>
        <h1 className="text-2xl font-light tracking-[0.15em]">{site.heroTitle}</h1>
        {site.tagline && <p className="text-xs mt-1 tracking-widest" style={{ color: accent }}>{site.tagline}</p>}
        <div className="flex items-center justify-center mt-3">
          <SiteNav links={navLinks} accent={accent} fontColor="#9B7070" panelBg={bg.bg}
            desktopClassName="hidden md:flex items-center justify-center gap-8" linkClassName="text-xs uppercase tracking-widest" />
        </div>
      </header>

      {/* Hero */}
      <section data-preview-tab="content" className="relative overflow-hidden" style={{ minHeight: '85vh', background: `linear-gradient(135deg, ${bg.heroFrom} 0%, ${bg.heroMid} 50%, ${bg.heroTo} 100%)` }}>
        <div className="absolute inset-0 opacity-10">
          {/* Decorative circles */}
          <div className="absolute top-10 right-10 w-96 h-96 rounded-full" style={{ background: accent, filter: 'blur(80px)' }} />
          <div className="absolute bottom-10 left-10 w-64 h-64 rounded-full" style={{ background: bg.circle2, filter: 'blur(60px)' }} />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-center min-h-[85vh] max-w-5xl mx-auto px-8 gap-12">
          <div className="text-center md:text-left flex-1">
            <p className="text-xs uppercase tracking-[0.3em] mb-4" style={{ color: accent }}>Photography Studio</p>
            <h2 className="text-5xl sm:text-6xl font-light leading-tight mb-6">{site.heroSubtitle}</h2>
            <p className="text-sm opacity-60 mb-8 max-w-xs leading-relaxed">{site.tagline}</p>
            <div className="flex gap-4 justify-center md:justify-start">
              {site.bookingEnabled && (
                <a href="#book" className="px-7 py-3 text-xs font-semibold uppercase tracking-widest rounded-full text-white transition-opacity hover:opacity-80"
                  style={{ backgroundColor: accent }}>{t('navBook', 'Book Now')}</a>
              )}
              <a href="#gallery" className="px-7 py-3 text-xs font-semibold uppercase tracking-widest rounded-full border transition-colors hover:bg-white/50"
                style={{ borderColor: accent, color: accent }}>{t('viewGallery', 'View Gallery')}</a>
            </div>
          </div>
          {heroImg && (
            <div className="flex-1 max-w-sm">
              <div className="rounded-[3rem] overflow-hidden shadow-2xl shadow-pink-100" style={{ aspectRatio: '3/4' }}>
                <HeroBackground url={heroImg} type={heroType} poster={heroPoster} />
              </div>
            </div>
          )}
        </div>
      </section>

            {/* Gallery */}
      <section id="gallery" data-preview-tab="gallery" className="py-20 px-6">
        <Reveal className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs uppercase tracking-[0.3em] mb-2" style={{ color: accent }}>{t('navGallery', 'Portfolio')}</p>
            <h2 className="text-4xl font-light">{t('navGallery', 'Our Beautiful Work')}</h2>
          </div>
          <Gallery style={site.galleryStyle} photos={site.galleryPhotos} studioName={site.heroTitle} accent={accent} fontColor={fontColor} language={site.language} />
        </Reveal>
      </section>

      {/* About */}
      <section id="about" data-preview-tab="content" className="py-20 px-6" style={{ background: `linear-gradient(135deg, ${bg.altFrom} 0%, ${bg.altTo} 100%)` }}>
        <Reveal className="max-w-3xl mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.3em] mb-4" style={{ color: accent }}>{t('navAbout', 'Our Story')}</p>
          <h2 className="text-4xl font-light mb-8">{t('sectionAboutHeading', 'About Us')}</h2>
          <p className="text-lg font-light leading-relaxed opacity-70">{site.about}</p>
          {site.city && <p className="mt-6 text-xs uppercase tracking-widest opacity-40">{site.city}</p>}
          <SocialIcons instagram={site.socialLinks?.instagram} facebook={site.socialLinks?.facebook} youtube={site.socialLinks?.youtube} className="justify-center mt-6" />
        </Reveal>
      </section>

      {/* Services */}
      {site.services.length > 0 && (
        <section id="services" data-preview-tab="services" className="py-20 px-6">
          <Reveal className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-xs uppercase tracking-[0.3em] mb-2" style={{ color: accent }}>{t('sectionServicesHeading', 'Services')}</p>
              <h2 className="text-4xl font-light">{t('sectionServicesHeading', 'What We Create')}</h2>
            </div>
            <div className="grid sm:grid-cols-3 gap-6">
              {site.services.map(s => (
                <div key={s.id} className="p-6 rounded-3xl text-center transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-pink-100" style={{ background: bg.cardBg, border: `1px solid ${bg.border}` }}>
                  <div className="w-10 h-10 rounded-full mx-auto mb-4" style={{ background: `${accent}20` }}>
                    <div className="w-full h-full flex items-center justify-center text-lg" style={{ color: accent }}>✦</div>
                  </div>
                  <h3 className="font-semibold text-sm mb-2">{s.name}</h3>
                  <p className="text-xs leading-relaxed opacity-60">{s.description}</p>
                  {s.price && <p className="mt-3 text-xs font-semibold" style={{ color: accent }}>{s.price}</p>}
                </div>
              ))}
            </div>
          </Reveal>
        </section>
      )}

      {/* Testimonials */}
      {!!site.testimonials?.length && (
        <section id="reviews" data-preview-tab="testimonials" className="py-20 px-6">
          <Reveal className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-xs uppercase tracking-[0.3em] mb-2" style={{ color: accent }}>{t('sectionReviewsHeading', 'Reviews')}</p>
              <h2 className="text-4xl font-light">{t('sectionReviewsHeading', 'What Clients Say')}</h2>
            </div>
            <Testimonials testimonials={site.testimonials} accent={accent} fontColor={fontColor} />
          </Reveal>
        </section>
      )}

      {/* Book */}
      <section id="book" data-preview-tab={site.bookingEnabled ? 'booking' : 'contact'} className="py-20 px-6" style={{ background: `linear-gradient(135deg, ${bg.altFrom} 0%, ${bg.altTo} 100%)` }}>
        <Reveal className="max-w-xl mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.3em] mb-4" style={{ color: accent }}>
            {site.bookingEnabled ? t('sectionBookHeadingEnabled', 'Book a Session') : t('sectionBookHeadingDisabled', 'Say Hello')}
          </p>
          <h2 className="text-4xl font-light mb-10">{t('bookingIntro', "Let's Work Together")}</h2>
          {site.bookingEnabled
            ? <BookingForm subdomain={site.subdomain} message={site.bookingMessage} accentColor={accent} fontColor={fontColor} language={site.language} />
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

      <footer data-preview-tab="contact" className="py-8 text-center text-xs opacity-30" style={{ borderTop: `1px solid ${bg.border}` }}>
        {site.heroTitle} · {t('footerPoweredBy', 'Powered by')} VayuStudios
      </footer>
    </div>
  )
}
