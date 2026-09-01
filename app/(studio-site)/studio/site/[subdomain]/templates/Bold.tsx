// Template: Bold — Large typography, high contrast, modern
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

const BACKGROUND_PRESETS: Record<string, { bg: string; headerBg: string; overlay: string }> = {
  default: { bg: '#000000', headerBg: 'rgba(0,0,0,0.95)',    overlay: 'rgba(0,0,0,0.6)' },
  wine:    { bg: '#1A0505', headerBg: 'rgba(26,5,5,0.95)',   overlay: 'rgba(26,5,5,0.6)' },
  ink:     { bg: '#00040D', headerBg: 'rgba(0,4,13,0.95)',   overlay: 'rgba(0,4,13,0.6)' },
}

export default function Bold({ site }: { site: StudioWebsite }) {
  const t = translator(site.language)
  const sx = (key: WebsiteSectionKey) => site.sectionStyles?.[key]
  const accent    = site.themeAccent ?? '#FF3B30'
  const fontColor = site.fontColor   ?? '#FFFFFF'
  const bg = BACKGROUND_PRESETS[site.backgroundPreset ?? 'default'] ?? BACKGROUND_PRESETS.default
  // Bold never fell back to the first gallery photo the way the other
  // templates do — only an explicitly-set cover shows a background here, so
  // an existing Bold site that never set one keeps its pure-black hero
  // exactly as it looks today.
  const heroBg = site.heroImageUrl
  const navLinks = [
    { label: t('navGallery', 'Work'), href: '#work' },
    { label: t('navAbout', 'About'), href: '#about' },
    ...(site.services.length > 0 ? [{ label: t('navServices', 'Services'), href: '#services' }] : []),
    ...(site.testimonials?.length ? [{ label: t('navReviews', 'Reviews'), href: '#reviews' }] : []),
  ]

  return (
    <div className="min-h-screen" style={{ background: bg.bg, color: fontColor, fontFamily: `"Inter", "Helvetica Neue", sans-serif, ${MULTI_SCRIPT_FONT_FALLBACK}` }}>

      {/* Nav */}
      <header data-preview-tab="content" className="sticky top-0 z-50 border-b border-white/10 px-6 py-4 flex items-center justify-between gap-4" style={{ background: bg.headerBg }}>
        <span className="font-black text-sm uppercase tracking-widest">{site.heroTitle}</span>
        <div className="flex items-center gap-6">
          <SiteNav links={navLinks} accent={accent} fontColor="#FFFFFF" panelBg={bg.bg}
            desktopClassName="hidden md:flex items-center gap-6" linkClassName="text-xs font-bold uppercase tracking-wider" />
          <a href="#book" style={{ backgroundColor: accent }} className="px-5 py-2 text-xs font-bold uppercase tracking-wider rounded-lg text-white transition-opacity hover:opacity-80 whitespace-nowrap">
            {site.bookingEnabled ? t('navBook', 'Book Now') : t('navContact', 'Contact')}
          </a>
        </div>
      </header>

      {/* Hero */}
      <section data-preview-tab="content" className="relative overflow-hidden px-6 pt-24 pb-16 border-b border-white/10" style={{ background: sx('hero')?.background }}>
        {heroBg && (
          <>
            {/* Base 40% wrapper opacity plus a separate 60%-alpha black scrim
                (bg.overlay, for text contrast) — two independent darkening
                layers. heroBrightness IS the wrapper's opacity directly
                (undefined keeps today's 0.4); the scrim's alpha fades toward
                0 in step with it, so at heroBrightness=1 both are gone and
                the cover shows fully as-is. */}
            <div className="absolute inset-0" style={{ opacity: site.heroBrightness ?? 0.4 }}>
              <HeroBackground url={heroBg} type={site.heroMediaType} poster={site.heroPosterUrl} />
            </div>
            <div className="absolute inset-0" style={{
              background: site.heroBrightness !== undefined
                ? bg.overlay.replace(/[\d.]+\)$/, `${Math.max(0, 0.6 * (1 - site.heroBrightness))})`)
                : bg.overlay,
            }} />
          </>
        )}
        <div className="relative max-w-6xl mx-auto">
          <h1 className="text-[clamp(3rem,12vw,10rem)] font-black leading-none uppercase tracking-tighter">
            {site.heroTitle.split(' ').map((word, i) => (
              <span key={i} className={i % 2 === 1 ? 'block' : 'block'} style={i % 2 === 1 ? { WebkitTextStroke: '1px white', color: 'transparent' } : {}}>
                {word}
              </span>
            ))}
          </h1>
          <p className="mt-8 text-lg text-white/50 max-w-xl" style={emphasisTextStyle(sx('hero')?.emphasis)}>{site.heroSubtitle}</p>
        </div>
      </section>

            {/* Gallery */}
      <section id="work" data-preview-tab="gallery" className="px-6 py-16 border-b border-white/10" style={{ background: sx('gallery')?.background }}>
        <Reveal className="max-w-6xl mx-auto">
          <div className="flex items-baseline justify-between mb-8">
            <h2 className="text-3xl font-black uppercase">{t('navGallery', 'Work')}</h2>
          </div>
          <Gallery style={site.galleryStyle} photos={site.galleryPhotos} studioName={site.heroTitle} accent={accent} fontColor={fontColor} language={site.language} />
        </Reveal>
      </section>

      {/* About */}
      <section id="about" data-preview-tab="content" className="px-6 py-16 border-b border-white/10" style={{ background: sx('about')?.background }}>
        <Reveal className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12">
          <div>
            <h2 className="text-5xl font-black uppercase mb-6" style={emphasisTextStyle(sx('about')?.emphasis)}>{t('sectionAboutHeading', 'About')}</h2>
            <p className="text-white/60 leading-relaxed" style={emphasisTextStyle(sx('about')?.emphasis)}>{site.about}</p>
            {site.city && <p className="mt-6 text-xs font-bold uppercase tracking-widest" style={{ color: accent }}>{site.city}</p>}
          </div>
          <SocialIcons instagram={site.socialLinks?.instagram} facebook={site.socialLinks?.facebook} youtube={site.socialLinks?.youtube} className="flex-col items-start gap-3" iconClassName="border border-white/10 rounded-xl px-6 py-4 hover:border-white/30 transition-colors" />
        </Reveal>
      </section>

      {/* Services */}
      {site.services.length > 0 && (
        <section id="services" data-preview-tab="services" className="px-6 py-16 border-b border-white/10" style={{ background: sx('services')?.background }}>
          <Reveal className="max-w-6xl mx-auto">
            <h2 className="text-5xl font-black uppercase mb-10" style={emphasisTextStyle(sx('services')?.emphasis)}>{t('sectionServicesHeading', 'Services')}</h2>
            {site.services.map((s, i) => (
              <div key={s.id} className="border-b border-white/10 py-6 grid md:grid-cols-3 gap-4 group transition-all duration-300 hover:bg-white/[0.03] hover:px-3 -mx-3 px-3">
                <div className="flex items-center gap-4">
                  <span className="text-xs font-bold" style={{ color: accent }}>0{i + 1}</span>
                  <h3 className="font-bold uppercase text-sm">{s.name}</h3>
                </div>
                <p className="text-white/50 text-sm md:col-span-2">{s.description}
                  {s.price && <span className="block mt-1 font-bold text-white/30 text-xs">{s.price}</span>}
                </p>
              </div>
            ))}
          </Reveal>
        </section>
      )}

      {/* Testimonials */}
      {!!site.testimonials?.length && (
        <section id="reviews" data-preview-tab="testimonials" className="px-6 py-16 border-b border-white/10" style={{ background: sx('testimonials')?.background }}>
          <Reveal className="max-w-6xl mx-auto">
            <h2 className="text-5xl font-black uppercase mb-10" style={emphasisTextStyle(sx('testimonials')?.emphasis)}>{t('sectionReviewsHeading', 'Reviews')}</h2>
            <Testimonials testimonials={site.testimonials} accent={accent} fontColor={fontColor} />
          </Reveal>
        </section>
      )}

      {/* Book */}
      <section id="book" data-preview-tab={site.bookingEnabled ? 'booking' : 'contact'} className="px-6 py-16" style={{ background: sx('book')?.background }}>
        <Reveal className="max-w-2xl mx-auto">
          <h2 className="text-5xl font-black uppercase mb-10" style={emphasisTextStyle(sx('book')?.emphasis)}>{site.bookingEnabled ? t('navBook', 'Book') : t('navContact', 'Contact')}</h2>
          {site.bookingEnabled
            ? <BookingForm subdomain={site.subdomain} message={site.bookingMessage} accentColor={accent} fontColor={fontColor} language={site.language} />
            : (
              <div className="space-y-4 text-white/60">
                {site.contactEmail && <p className="text-lg">{site.contactEmail}</p>}
                {site.contactPhone && <p className="text-lg">{site.contactPhone}</p>}
                <WhatsAppButton number={site.whatsapp} language={site.language} />
              </div>
            )
          }
        </Reveal>
      </section>

      <footer data-preview-tab="contact" className="border-t border-white/10 py-6 px-6 flex items-center justify-between text-xs text-white/20">
        <span>{site.heroTitle}</span>
        <span>{t('footerPoweredBy', 'Powered by')} VayuStudios</span>
      </footer>
    </div>
  )
}
