// Template: Bold — Large typography, high contrast, modern
import type { StudioWebsite } from '@/types/studio'
import BookingForm from './BookingForm'
import PortfolioGallery from './PortfolioGallery'
import SocialIcons, { WhatsAppButton } from './SocialIcons'
import HeroBackground from './HeroMedia'
import Reveal from './Reveal'

export default function Bold({ site }: { site: StudioWebsite }) {
  const accent    = site.themeAccent ?? '#FF3B30'
  const fontColor = site.fontColor   ?? '#FFFFFF'
  // Bold never fell back to the first gallery photo the way the other
  // templates do — only an explicitly-set cover shows a background here, so
  // an existing Bold site that never set one keeps its pure-black hero
  // exactly as it looks today.
  const heroBg = site.heroImageUrl

  return (
    <div className="min-h-screen bg-black" style={{ color: fontColor, fontFamily: '"Inter", "Helvetica Neue", sans-serif' }}>

      {/* Nav */}
      <header className="sticky top-0 z-50 bg-black/95 backdrop-blur border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <span className="font-black text-sm uppercase tracking-widest">{site.heroTitle}</span>
        <a href="#book" style={{ backgroundColor: accent }} className="px-5 py-2 text-xs font-bold uppercase tracking-wider rounded-lg text-white transition-opacity hover:opacity-80">
          {site.bookingEnabled ? 'Book Now' : 'Contact'}
        </a>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pt-24 pb-16 border-b border-white/10">
        {heroBg && (
          <>
            <div className="absolute inset-0 opacity-40">
              <HeroBackground url={heroBg} type={site.heroMediaType} poster={site.heroPosterUrl} />
            </div>
            <div className="absolute inset-0 bg-black/60" />
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
          <p className="mt-8 text-lg text-white/50 max-w-xl">{site.heroSubtitle}</p>
        </div>
      </section>

            {/* Gallery */}
      <section className="px-6 py-16 border-b border-white/10">
        <Reveal className="max-w-6xl mx-auto">
          <div className="flex items-baseline justify-between mb-8">
            <h2 className="text-3xl font-black uppercase">Work</h2>
          </div>
          <PortfolioGallery photos={site.galleryPhotos} studioName={site.heroTitle} accent={accent} fontColor={fontColor} />
        </Reveal>
      </section>

      {/* About */}
      <section className="px-6 py-16 border-b border-white/10">
        <Reveal className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12">
          <div>
            <h2 className="text-5xl font-black uppercase mb-6">About</h2>
            <p className="text-white/60 leading-relaxed">{site.about}</p>
            {site.city && <p className="mt-6 text-xs font-bold uppercase tracking-widest" style={{ color: accent }}>{site.city}</p>}
          </div>
          <SocialIcons instagram={site.socialLinks?.instagram} facebook={site.socialLinks?.facebook} youtube={site.socialLinks?.youtube} className="flex-col items-start gap-3" iconClassName="border border-white/10 rounded-xl px-6 py-4 hover:border-white/30 transition-colors" />
        </Reveal>
      </section>

      {/* Services */}
      {site.services.length > 0 && (
        <section className="px-6 py-16 border-b border-white/10">
          <Reveal className="max-w-6xl mx-auto">
            <h2 className="text-5xl font-black uppercase mb-10">Services</h2>
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

      {/* Book */}
      <section id="book" className="px-6 py-16">
        <Reveal className="max-w-2xl mx-auto">
          <h2 className="text-5xl font-black uppercase mb-10">{site.bookingEnabled ? 'Book' : 'Contact'}</h2>
          {site.bookingEnabled
            ? <BookingForm subdomain={site.subdomain} message={site.bookingMessage} accentColor={accent} fontColor={fontColor} />
            : (
              <div className="space-y-4 text-white/60">
                {site.contactEmail && <p className="text-lg">{site.contactEmail}</p>}
                {site.contactPhone && <p className="text-lg">{site.contactPhone}</p>}
                <WhatsAppButton number={site.whatsapp} />
              </div>
            )
          }
        </Reveal>
      </section>

      <footer className="border-t border-white/10 py-6 px-6 flex items-center justify-between text-xs text-white/20">
        <span>{site.heroTitle}</span>
        <span>Powered by VayuStudios</span>
      </footer>
    </div>
  )
}
