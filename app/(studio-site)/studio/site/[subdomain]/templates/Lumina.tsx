// Template: Lumina — Dark, elegant, full-bleed
import type { StudioWebsite } from '@/types/studio'
import BookingForm from './BookingForm'
import PortfolioGallery from './PortfolioGallery'
import SocialIcons from './SocialIcons'

export default function Lumina({ site }: { site: StudioWebsite }) {
  const accent    = site.themeAccent ?? '#C9A84C'
  const fontColor = site.fontColor   ?? '#F5F0E8'

  return (
    <div className="min-h-screen" style={{ background: '#0A0A0A', color: fontColor, fontFamily: 'Georgia, serif' }}>

      {/* Hero */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6"
        style={{ background: 'linear-gradient(160deg, #0A0A0A 0%, #1A1208 100%)' }}>
        {site.galleryPhotos[0] && (
          <div className="absolute inset-0 opacity-20">
            <img src={site.galleryPhotos[0].url} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, #0A0A0A 0%, transparent 40%, #0A0A0A 100%)' }} />
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
              Book a Session
            </a>
          )}
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 opacity-30">
          <div className="w-px h-16 mx-auto" style={{ background: accent }} />
        </div>
      </section>

      {/* Gallery */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs uppercase tracking-[0.3em] text-center mb-12 opacity-40">Portfolio</p>
          <PortfolioGallery photos={site.galleryPhotos} studioName={site.heroTitle} accent={accent} />
        </div>
      </section>

      {/* About */}
      <section className="py-24 px-6" style={{ background: '#111' }}>
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.3em] mb-8 opacity-40">About</p>
          <p className="text-xl sm:text-2xl font-light leading-relaxed opacity-80">{site.about}</p>
          {site.city && <p className="mt-6 text-sm opacity-40 uppercase tracking-widest">{site.city}</p>}
        </div>
      </section>

      {/* Services */}
      {site.services.length > 0 && (
        <section className="py-24 px-6">
          <div className="max-w-4xl mx-auto">
            <p className="text-xs uppercase tracking-[0.3em] text-center mb-12 opacity-40">Services</p>
            <div className="grid sm:grid-cols-3 gap-8">
              {site.services.map(s => (
                <div key={s.id} className="border-t pt-6" style={{ borderColor: 'rgba(201,168,76,0.2)' }}>
                  <h3 className="font-semibold mb-3 text-base" style={{ color: accent }}>{s.name}</h3>
                  <p className="text-sm opacity-60 leading-relaxed mb-3">{s.description}</p>
                  {s.price && <p className="text-xs opacity-40 uppercase tracking-wider">{s.price}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Contact + Booking */}
      <section id="book" className="py-24 px-6" style={{ background: '#111' }}>
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.3em] mb-4 opacity-40">
            {site.bookingEnabled ? 'Book a Session' : 'Contact'}
          </p>
          <h2 className="text-3xl font-light mb-12">Let&apos;s create something beautiful</h2>
          {site.bookingEnabled
            ? <BookingForm subdomain={site.subdomain} message={site.bookingMessage} accentColor={accent} />
            : (
              <div className="space-y-3 text-sm opacity-60">
                {site.contactEmail && <p>✉ {site.contactEmail}</p>}
                {site.contactPhone && <p>☎ {site.contactPhone}</p>}
                {site.whatsapp && <p><a href={`https://wa.me/${site.whatsapp.replace(/\D/g,'')}`} className="underline">WhatsApp</a></p>}
              </div>
            )
          }
        </div>
      </section>

      <SocialFooter site={site} accent={accent} />
    </div>
  )
}

function SocialFooter({ site, accent }: { site: StudioWebsite; accent: string }) {
  return (
    <footer className="py-10 px-6 text-center text-xs opacity-30" style={{ borderTop: '1px solid #222' }}>
      <SocialIcons instagram={site.socialLinks?.instagram} facebook={site.socialLinks?.facebook} youtube={site.socialLinks?.youtube} className="justify-center mb-4" />
      <p>{site.heroTitle} · Powered by <span style={{ color: accent }}>VayuStudios</span></p>
    </footer>
  )
}
