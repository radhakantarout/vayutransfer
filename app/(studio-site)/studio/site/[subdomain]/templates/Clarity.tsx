// Template: Clarity — Minimal white, editorial
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

const BACKGROUND_PRESETS: Record<string, { bg: string; alt: string; headerBg: string }> = {
  default: { bg: '#FFFFFF', alt: '#F9FAFB', headerBg: 'rgba(255,255,255,0.95)' },
  ivory:   { bg: '#FBF8F3', alt: '#F5EFE4', headerBg: 'rgba(251,248,243,0.95)' },
  cool:    { bg: '#F7F8FA', alt: '#EEF0F3', headerBg: 'rgba(247,248,250,0.95)' },
}

export default function Clarity({ site }: { site: StudioWebsite }) {
  const t = translator(site.language)
  const sx = (key: WebsiteSectionKey) => site.sectionStyles?.[key]
  const accent    = site.themeAccent ?? '#1A1A1A'
  const fontColor = site.fontColor   ?? '#1A1A1A'
  const bg = BACKGROUND_PRESETS[site.backgroundPreset ?? 'default'] ?? BACKGROUND_PRESETS.default
  const heroImg    = site.heroImageUrl || site.galleryPhotos[0]?.url
  const heroType   = site.heroImageUrl ? site.heroMediaType : site.galleryPhotos[0]?.type
  const heroPoster = site.heroImageUrl ? site.heroPosterUrl : site.galleryPhotos[0]?.thumbnailUrl
  const navLinks = [
    { label: t('navGallery', 'Work'), href: '#work' },
    { label: t('navAbout', 'About'), href: '#about' },
    ...(site.services.length > 0 ? [{ label: t('navServices', 'Services'), href: '#services' }] : []),
    ...(site.testimonials?.length ? [{ label: t('navReviews', 'Reviews'), href: '#reviews' }] : []),
    ...(site.bookingEnabled ? [{ label: t('navContact', 'Contact'), href: '#book' }] : []),
  ]

  return (
    <div className="min-h-screen" style={{ background: bg.bg, color: fontColor, fontFamily: `"Helvetica Neue", Helvetica, Arial, sans-serif, ${MULTI_SCRIPT_FONT_FALLBACK}` }}>

      {/* Header */}
      <header data-preview-tab="content" className="fixed top-0 left-0 right-0 z-50 border-b border-gray-100" style={{ background: bg.headerBg }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-bold text-sm tracking-widest uppercase">{site.heroTitle}</span>
          <SiteNav links={navLinks} accent={accent} fontColor="#6b7280" panelBg={bg.bg}
            desktopClassName="hidden md:flex items-center gap-8" linkClassName="text-xs uppercase tracking-widest" />
        </div>
      </header>

      {/* Hero */}
      <section data-preview-tab="content" className="pt-20" style={{ background: sx('hero')?.background }}>
        {heroImg ? (
          <div className="relative h-[90vh]">
            <HeroBackground url={heroImg} type={heroType} poster={heroPoster} />
            <div className="absolute inset-0 bg-black/20" />
            <div className="absolute bottom-12 left-12">
              <h1 className="text-5xl sm:text-7xl font-light text-white leading-none">{site.heroTitle}</h1>
              <p className="text-white/70 mt-4 text-lg font-light" style={emphasisTextStyle(sx('hero')?.emphasis)}>{site.heroSubtitle}</p>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-6 pt-24 pb-16">
            <h1 className="text-5xl sm:text-7xl font-light leading-none mb-6">{site.heroTitle}</h1>
            <p className="text-xl text-gray-500 font-light" style={emphasisTextStyle(sx('hero')?.emphasis)}>{site.heroSubtitle}</p>
          </div>
        )}
      </section>

      {/* Gallery */}
      <section id="work" data-preview-tab="gallery" className="py-16 px-6" style={{ background: sx('gallery')?.background }}>
        <Reveal className="max-w-6xl mx-auto">
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-8">{t('navGallery', 'Selected Work')}</p>
          <Gallery style={site.galleryStyle} photos={site.galleryPhotos} studioName={site.heroTitle} accent={accent} fontColor={fontColor} language={site.language} />
        </Reveal>
      </section>

      {/* About */}
      <section id="about" data-preview-tab="content" className="py-24 px-6" style={{ background: sx('about')?.background ?? bg.alt }}>
        <Reveal className="max-w-3xl mx-auto">
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-6" style={emphasisTextStyle(sx('about')?.emphasis)}>{t('sectionAboutHeading', 'About')}</p>
          <p className="text-2xl font-light leading-relaxed text-gray-700" style={emphasisTextStyle(sx('about')?.emphasis)}>{site.about}</p>
          {site.city && <p className="mt-8 text-sm text-gray-400 uppercase tracking-widest">{site.city}</p>}
        </Reveal>
      </section>

      {/* Services */}
      {site.services.length > 0 && (
        <section id="services" data-preview-tab="services" className="py-24 px-6" style={{ background: sx('services')?.background }}>
          <Reveal className="max-w-4xl mx-auto">
            <p className="text-xs uppercase tracking-widest text-gray-400 mb-12" style={emphasisTextStyle(sx('services')?.emphasis)}>{t('sectionServicesHeading', 'Services')}</p>
            <div className="divide-y divide-gray-100">
              {site.services.map(s => (
                <div key={s.id} className="py-8 grid sm:grid-cols-3 gap-4 transition-all duration-300 hover:bg-gray-50 rounded-xl px-3 -mx-3">
                  <h3 className="font-semibold text-sm uppercase tracking-wider">{s.name}</h3>
                  <p className="text-gray-600 text-sm sm:col-span-2 leading-relaxed">{s.description}
                    {s.price && <span className="block mt-1 text-gray-400 text-xs">{s.price}</span>}
                  </p>
                </div>
              ))}
            </div>
          </Reveal>
        </section>
      )}

      {/* Testimonials */}
      {!!site.testimonials?.length && (
        <section id="reviews" data-preview-tab="testimonials" className="py-24 px-6" style={{ background: sx('testimonials')?.background }}>
          <Reveal className="max-w-5xl mx-auto">
            <p className="text-xs uppercase tracking-widest text-gray-400 mb-12" style={emphasisTextStyle(sx('testimonials')?.emphasis)}>{t('sectionReviewsHeading', 'What Clients Say')}</p>
            <Testimonials testimonials={site.testimonials} accent={accent} fontColor={fontColor} />
          </Reveal>
        </section>
      )}

      {/* Booking */}
      <section id="book" data-preview-tab={site.bookingEnabled ? 'booking' : 'contact'} className="py-24 px-6" style={{ background: sx('book')?.background ?? bg.alt }}>
        <Reveal className="max-w-2xl mx-auto">
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-4" style={emphasisTextStyle(sx('book')?.emphasis)}>
            {site.bookingEnabled ? t('sectionBookHeadingEnabled', 'Book a Session') : t('sectionBookHeadingDisabled', 'Contact')}
          </p>
          <h2 className="text-3xl font-light mb-10" style={emphasisTextStyle(sx('book')?.emphasis)}>{t('bookingIntro', 'Get in touch')}</h2>
          {site.bookingEnabled
            ? (
              <div style={{ '--accent': accent } as React.CSSProperties}>
                <BookingFormLight subdomain={site.subdomain} message={site.bookingMessage} accent={accent} fontColor={fontColor} language={site.language} />
              </div>
            )
            : (
              <div className="space-y-3 text-sm text-gray-600">
                {site.contactEmail && <p>{site.contactEmail}</p>}
                {site.contactPhone && <p>{site.contactPhone}</p>}
                <WhatsAppButton number={site.whatsapp} language={site.language} />
              </div>
            )
          }
        </Reveal>
      </section>

      <footer data-preview-tab="contact" className="py-8 px-6 border-t border-gray-100 text-center">
        <SocialIcons instagram={site.socialLinks?.instagram} facebook={site.socialLinks?.facebook} youtube={site.socialLinks?.youtube} className="justify-center mb-3 text-gray-400" iconClassName="hover:!opacity-100 text-gray-400 hover:text-gray-700" />
        <p className="text-xs text-gray-300">{site.heroTitle} · {t('footerPoweredBy', 'Powered by')} VayuStudios</p>
      </footer>
    </div>
  )
}

function BookingFormLight({ subdomain, message, accent, fontColor, language }: { subdomain: string; message?: string; accent: string; fontColor: string; language?: StudioWebsite['language'] }) {
  return (
    <div className="[&_input]:bg-gray-50 [&_select]:bg-gray-50 [&_textarea]:bg-gray-50">
      <BookingForm subdomain={subdomain} message={message} accentColor={accent} textOnAccent="#fff" fontColor={fontColor} language={language} />
    </div>
  )
}
