// Template: Lumina — Dark, elegant, full-bleed
import type { StudioWebsite } from '@/types/studio'
import BookingForm from './BookingForm'
import Gallery from './Gallery'
import SocialIcons, { WhatsAppButton } from './SocialIcons'
import HeroBackground from './HeroMedia'
import Reveal from './Reveal'
import SiteNav from './SiteNav'
import Testimonials from './Testimonials'
import { translator, MULTI_SCRIPT_FONT_FALLBACK } from '@/lib/studio/i18n'

// 'default' matches every pre-existing site's hardcoded colors exactly — an
// unset backgroundPreset must render byte-for-byte the same as before this
// existed. 'maroon'/'teal' are Batch 1's Kumkum/Rooh palettes, folded in here
// as swatches instead of being separate template files (see the website
// builder plan: color alone doesn't justify a new template).
const BACKGROUND_PRESETS: Record<string, { bg: string; alt: string; heroEnd: string }> = {
  default: { bg: '#0A0A0A', alt: '#111',    heroEnd: '#1A1208' },
  maroon:  { bg: '#3B0A1A', alt: '#4A0E1F', heroEnd: '#4A0E1F' },
  teal:    { bg: '#0A1615', alt: '#0F1F1D', heroEnd: '#0F1F1D' },
}

export default function Lumina({ site }: { site: StudioWebsite }) {
  const t = translator(site.language)
  const accent    = site.themeAccent ?? '#C9A84C'
  const fontColor = site.fontColor   ?? '#F5F0E8'
  const bg = BACKGROUND_PRESETS[site.backgroundPreset ?? 'default'] ?? BACKGROUND_PRESETS.default
  const heroImg    = site.heroImageUrl || site.galleryPhotos[0]?.url
  const heroType   = site.heroImageUrl ? site.heroMediaType : site.galleryPhotos[0]?.type
  const heroPoster = site.heroImageUrl ? site.heroPosterUrl : site.galleryPhotos[0]?.thumbnailUrl
  const navLinks = [
    { label: t('navGallery', 'Portfolio'), href: '#portfolio' },
    { label: t('navAbout', 'About'), href: '#about' },
    ...(site.services.length > 0 ? [{ label: t('navServices', 'Services'), href: '#services' }] : []),
    ...(site.testimonials?.length ? [{ label: t('navReviews', 'Reviews'), href: '#reviews' }] : []),
    { label: site.bookingEnabled ? t('navBook', 'Book') : t('navContact', 'Contact'), href: '#book' },
  ]

  return (
    <div className="min-h-screen" style={{ background: bg.bg, color: fontColor, fontFamily: `Georgia, serif, ${MULTI_SCRIPT_FONT_FALLBACK}` }}>

      {/* Nav */}
      <header data-preview-tab="content" className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 sm:px-10 py-5">
        <span className="text-sm uppercase tracking-[0.25em]">{site.heroTitle}</span>
        <SiteNav links={navLinks} accent={accent} fontColor={fontColor} panelBg={bg.bg} linkClassName="text-xs uppercase tracking-[0.2em]" />
      </header>

      {/* Hero */}
      <section data-preview-tab="content" className="relative min-h-screen flex flex-col items-center justify-center text-center px-6"
        style={{ background: `linear-gradient(160deg, ${bg.bg} 0%, ${bg.heroEnd} 100%)` }}>
        {heroImg && (
          <div className="absolute inset-0 opacity-20">
            <HeroBackground url={heroImg} type={heroType} poster={heroPoster} />
            <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, ${bg.bg} 0%, transparent 40%, ${bg.bg} 100%)` }} />
          </div>
        )}
        <div className="relative z-10">
          <p className="text-xs font-bold uppercase tracking-[0.3em] mb-6" style={{ color: accent }}>Photography Studio</p>
          <h1 className="text-6xl sm:text-8xl font-light mb-6 leading-none tracking-tight">{site.heroTitle}</h1>
          <p className="text-lg sm:text-xl opacity-60 mb-4 max-w-xl mx-auto font-light">{site.heroSubtitle}</p>
          {site.tagline && <p className="text-sm opacity-40 mb-10">{site.tagline}</p>}
          {site.bookingEnabled && (
            <a href="#book" style={{ borderColor: accent, color: accent }}
              className="inline-block border px-10 py-3.5 text-sm uppercase tracking-widest hover:opacity-80 transition-opacity">
              {t('sectionBookHeadingEnabled', 'Book a Session')}
            </a>
          )}
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 opacity-30">
          <div className="w-px h-16 mx-auto" style={{ background: accent }} />
        </div>
      </section>

      {/* Gallery */}
      <section id="portfolio" data-preview-tab="gallery" className="py-24 px-6">
        <Reveal className="max-w-6xl mx-auto">
          <p className="text-xs uppercase tracking-[0.3em] text-center mb-12 opacity-40">{t('navGallery', 'Portfolio')}</p>
          <Gallery style={site.galleryStyle} photos={site.galleryPhotos} studioName={site.heroTitle} accent={accent} fontColor={fontColor} language={site.language} />
        </Reveal>
      </section>

      {/* About */}
      <section id="about" data-preview-tab="content" className="py-24 px-6" style={{ background: bg.alt }}>
        <Reveal className="max-w-3xl mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.3em] mb-8 opacity-40">{t('sectionAboutHeading', 'About')}</p>
          <p className="text-xl sm:text-2xl font-light leading-relaxed opacity-80">{site.about}</p>
          {site.city && <p className="mt-6 text-sm opacity-40 uppercase tracking-widest">{site.city}</p>}
        </Reveal>
      </section>

      {/* Services */}
      {site.services.length > 0 && (
        <section id="services" data-preview-tab="services" className="py-24 px-6">
          <Reveal className="max-w-4xl mx-auto">
            <p className="text-xs uppercase tracking-[0.3em] text-center mb-12 opacity-40">{t('sectionServicesHeading', 'Services')}</p>
            <div className="grid sm:grid-cols-3 gap-8">
              {site.services.map(s => (
                <div key={s.id} className="border-t pt-6 px-1 rounded-b-xl transition-all duration-300 hover:-translate-y-1 hover:bg-white/[0.03]" style={{ borderColor: `${accent}33` }}>
                  <h3 className="font-semibold mb-3 text-base" style={{ color: accent }}>{s.name}</h3>
                  <p className="text-sm opacity-60 leading-relaxed mb-3">{s.description}</p>
                  {s.price && <p className="text-xs opacity-40 uppercase tracking-wider">{s.price}</p>}
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
            <p className="text-xs uppercase tracking-[0.3em] text-center mb-12 opacity-40">{t('sectionReviewsHeading', 'What Clients Say')}</p>
            <Testimonials testimonials={site.testimonials} accent={accent} fontColor={fontColor} />
          </Reveal>
        </section>
      )}

      {/* Contact + Booking */}
      <section id="book" data-preview-tab={site.bookingEnabled ? 'booking' : 'contact'} className="py-24 px-6" style={{ background: bg.alt }}>
        <Reveal className="max-w-2xl mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.3em] mb-4 opacity-40">
            {site.bookingEnabled ? t('sectionBookHeadingEnabled', 'Book a Session') : t('sectionBookHeadingDisabled', 'Contact')}
          </p>
          <h2 className="text-3xl font-light mb-12">{t('bookingIntro', "Let's create something beautiful")}</h2>
          {site.bookingEnabled
            ? <BookingForm subdomain={site.subdomain} message={site.bookingMessage} accentColor={accent} fontColor={fontColor} language={site.language} />
            : (
              <div className="space-y-3 text-sm opacity-60">
                {site.contactEmail && <p>✉ {site.contactEmail}</p>}
                {site.contactPhone && <p>☎ {site.contactPhone}</p>}
                <WhatsAppButton number={site.whatsapp} language={site.language} />
              </div>
            )
          }
        </Reveal>
      </section>

      <SocialFooter site={site} accent={accent} />
    </div>
  )
}

function SocialFooter({ site, accent }: { site: StudioWebsite; accent: string }) {
  const t = translator(site.language)
  return (
    <footer data-preview-tab="contact" className="py-10 px-6 text-center text-xs opacity-30" style={{ borderTop: '1px solid #222' }}>
      <SocialIcons instagram={site.socialLinks?.instagram} facebook={site.socialLinks?.facebook} youtube={site.socialLinks?.youtube} className="justify-center mb-4" />
      <p>{site.heroTitle} · {t('footerPoweredBy', 'Powered by')} <span style={{ color: accent }}>VayuStudios</span></p>
    </footer>
  )
}
