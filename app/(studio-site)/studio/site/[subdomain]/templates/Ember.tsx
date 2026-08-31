// Template: Ember — Warm earth tones, soft and inviting
import type { StudioWebsite } from '@/types/studio'
import BookingForm from './BookingForm'
import Gallery from './Gallery'
import SocialIcons, { WhatsAppButton } from './SocialIcons'
import HeroBackground from './HeroMedia'
import Reveal from './Reveal'
import SiteNav from './SiteNav'
import Testimonials from './Testimonials'
import { translator, MULTI_SCRIPT_FONT_FALLBACK } from '@/lib/studio/i18n'

const BACKGROUND_PRESETS: Record<string, { bg: string; alt: string; border: string; heroOverlay: string; heroFrom: string; heroTo: string }> = {
  default:     { bg: '#FAF6F1', alt: '#F0E8DF', border: '#E8DDD5', heroOverlay: 'rgba(250,246,241,0.9)', heroFrom: '#F5EDE3', heroTo: '#E8D5C4' },
  terracotta:  { bg: '#FBF1E7', alt: '#F5DFC7', border: '#EAD1B0', heroOverlay: 'rgba(251,241,231,0.9)', heroFrom: '#F7E4CC', heroTo: '#E8C39C' },
  sage:        { bg: '#F6F7F0', alt: '#E9EDDF', border: '#D9E0C9', heroOverlay: 'rgba(246,247,240,0.9)', heroFrom: '#EFF2E4', heroTo: '#D7DFC2' },
}

export default function Ember({ site }: { site: StudioWebsite }) {
  const t = translator(site.language)
  const accent    = site.themeAccent ?? '#C4622D'
  const fontColor = site.fontColor   ?? '#2C1810'
  const bg = BACKGROUND_PRESETS[site.backgroundPreset ?? 'default'] ?? BACKGROUND_PRESETS.default
  const heroImg    = site.heroImageUrl || site.galleryPhotos[0]?.url
  const heroType   = site.heroImageUrl ? site.heroMediaType : site.galleryPhotos[0]?.type
  const heroPoster = site.heroImageUrl ? site.heroPosterUrl : site.galleryPhotos[0]?.thumbnailUrl
  const navLinks = [
    { label: t('navGallery', 'Gallery'), href: '#gallery' },
    { label: t('navAbout', 'Story'), href: '#about' },
    ...(site.services.length > 0 ? [{ label: t('navServices', 'Services'), href: '#services' }] : []),
    ...(site.testimonials?.length ? [{ label: t('navReviews', 'Reviews'), href: '#reviews' }] : []),
    ...(site.bookingEnabled ? [{ label: t('navBook', 'Book Now'), href: '#book' }] : []),
  ]

  return (
    <div className="min-h-screen" style={{ background: bg.bg, color: fontColor, fontFamily: `"Palatino Linotype", Palatino, serif, ${MULTI_SCRIPT_FONT_FALLBACK}` }}>

      {/* Nav */}
      <header data-preview-tab="content" className="py-6 px-8 flex items-center justify-between" style={{ borderBottom: `1px solid ${bg.border}` }}>
        <div>
          <span className="text-xl font-semibold">{site.heroTitle}</span>
          {site.tagline && <span className="text-xs ml-3 opacity-50">{site.tagline}</span>}
        </div>
        <SiteNav links={navLinks} accent={accent} fontColor="#8B6655" panelBg={bg.bg}
          desktopClassName="hidden md:flex gap-8 text-sm" linkClassName="normal-case tracking-normal text-sm" />
      </header>

      {/* Hero */}
      <section data-preview-tab="content" className="relative overflow-hidden" style={{ minHeight: '80vh' }}>
        {heroImg ? (
          <>
            <HeroBackground url={heroImg} type={heroType} poster={heroPoster}
              className="w-full h-full object-cover absolute inset-0" style={{ minHeight: '80vh', opacity: 0.85 }} />
            <div className="absolute inset-0" style={{ background: `linear-gradient(to right, ${bg.heroOverlay} 40%, transparent 100%)` }} />
          </>
        ) : (
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${bg.heroFrom} 0%, ${bg.heroTo} 100%)` }} />
        )}
        <div className="relative z-10 max-w-2xl px-10 py-24 flex flex-col justify-center" style={{ minHeight: '80vh' }}>
          <p className="text-xs uppercase tracking-[0.25em] mb-4" style={{ color: accent }}>Photography</p>
          <h1 className="text-5xl sm:text-7xl font-light leading-tight mb-6">{site.heroTitle}</h1>
          <p className="text-lg leading-relaxed mb-8 opacity-70">{site.heroSubtitle}</p>
          {site.bookingEnabled && (
            <a href="#book" className="self-start px-8 py-3.5 text-sm font-semibold rounded-full text-white transition-opacity hover:opacity-80"
              style={{ backgroundColor: accent }}>{t('sectionBookHeadingEnabled', 'Book a Session')} →</a>
          )}
        </div>
      </section>

            {/* Gallery */}
      <section id="gallery" data-preview-tab="gallery" className="py-20 px-6">
        <Reveal className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-light text-center mb-12">{t('navGallery', 'Our Work')}</h2>
          <Gallery style={site.galleryStyle} photos={site.galleryPhotos} studioName={site.heroTitle} accent={accent} fontColor={fontColor} language={site.language} />
        </Reveal>
      </section>

      {/* About */}
      <section id="about" data-preview-tab="content" className="py-20 px-6" style={{ background: bg.alt }}>
        <Reveal className="max-w-4xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          {site.galleryPhotos[1] && (
            <div className="rounded-3xl overflow-hidden shadow-xl transition-transform duration-500 hover:scale-[1.02]" style={{ aspectRatio: '3/4' }}>
              <HeroBackground url={site.galleryPhotos[1].url} type={site.galleryPhotos[1].type} poster={site.galleryPhotos[1].thumbnailUrl} />
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-widest mb-4" style={{ color: accent }}>{t('navAbout', 'Our Story')}</p>
            <h2 className="text-3xl font-light mb-6">{t('sectionAboutHeading', 'About Us')}</h2>
            <p className="leading-relaxed opacity-70 text-sm">{site.about}</p>
            {site.city && <p className="mt-6 text-xs uppercase tracking-widest opacity-40">{site.city}</p>}
            <SocialIcons instagram={site.socialLinks?.instagram} facebook={site.socialLinks?.facebook} youtube={site.socialLinks?.youtube} className="mt-6" />
          </div>
        </Reveal>
      </section>

      {/* Services */}
      {site.services.length > 0 && (
        <section id="services" data-preview-tab="services" className="py-20 px-6">
          <Reveal className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-light text-center mb-14">{t('sectionServicesHeading', 'What We Offer')}</h2>
            <div className="grid sm:grid-cols-3 gap-6">
              {site.services.map((s, i) => (
                <div key={s.id} className="rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl" style={{ background: i % 2 === 0 ? bg.alt : bg.bg, border: `1px solid ${bg.border}` }}>
                  <h3 className="font-semibold mb-2 text-sm">{s.name}</h3>
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
            <h2 className="text-3xl font-light text-center mb-14">{t('sectionReviewsHeading', 'What Clients Say')}</h2>
            <Testimonials testimonials={site.testimonials} accent={accent} fontColor={fontColor} />
          </Reveal>
        </section>
      )}

      {/* Book */}
      <section id="book" data-preview-tab={site.bookingEnabled ? 'booking' : 'contact'} className="py-20 px-6" style={{ background: bg.alt }}>
        <Reveal className="max-w-xl mx-auto text-center">
          <p className="text-xs uppercase tracking-widest mb-3" style={{ color: accent }}>
            {site.bookingEnabled ? t('sectionBookHeadingEnabled', 'Book a Session') : t('sectionBookHeadingDisabled', 'Get in Touch')}
          </p>
          <h2 className="text-3xl font-light mb-10">{t('bookingIntro', "Let's create memories together")}</h2>
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

      <footer data-preview-tab="contact" className="py-8 px-6 text-center text-xs opacity-40" style={{ borderTop: `1px solid ${bg.border}` }}>
        {site.heroTitle} · {t('footerPoweredBy', 'Powered by')} VayuStudios
      </footer>
    </div>
  )
}
