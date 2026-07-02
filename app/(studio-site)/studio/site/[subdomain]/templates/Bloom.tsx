// Template: Bloom — Pastel, feminine, airy, romantic
import type { StudioWebsite } from '@/types/studio'
import BookingForm from './BookingForm'
import PortfolioGallery from './PortfolioGallery'
import SocialIcons from './SocialIcons'

export default function Bloom({ site }: { site: StudioWebsite }) {
  const accent = site.themeAccent ?? '#D4849A'

  return (
    <div className="min-h-screen" style={{ background: '#FDF8F6', color: '#3D2B2B', fontFamily: '"Cormorant Garamond", "Times New Roman", serif' }}>

      {/* Nav */}
      <header className="py-5 px-8 text-center" style={{ borderBottom: '1px solid #F0DDD8' }}>
        <h1 className="text-2xl font-light tracking-[0.15em]">{site.heroTitle}</h1>
        {site.tagline && <p className="text-xs mt-1 tracking-widest" style={{ color: accent }}>{site.tagline}</p>}
        <nav className="flex items-center justify-center gap-8 mt-3 text-xs uppercase tracking-widest" style={{ color: '#9B7070' }}>
          <a href="#gallery" className="hover:opacity-60 transition-opacity">Gallery</a>
          <a href="#about" className="hover:opacity-60 transition-opacity">About</a>
          <a href="#services" className="hover:opacity-60 transition-opacity">Services</a>
          {site.bookingEnabled && <a href="#book" className="hover:opacity-60 transition-opacity" style={{ color: accent }}>Book</a>}
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: '85vh', background: 'linear-gradient(135deg, #FDF0EE 0%, #F9E8E8 50%, #F5ECEF 100%)' }}>
        <div className="absolute inset-0 opacity-10">
          {/* Decorative circles */}
          <div className="absolute top-10 right-10 w-96 h-96 rounded-full" style={{ background: accent, filter: 'blur(80px)' }} />
          <div className="absolute bottom-10 left-10 w-64 h-64 rounded-full" style={{ background: '#F9BCC4', filter: 'blur(60px)' }} />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-center min-h-[85vh] max-w-5xl mx-auto px-8 gap-12">
          <div className="text-center md:text-left flex-1">
            <p className="text-xs uppercase tracking-[0.3em] mb-4" style={{ color: accent }}>Photography Studio</p>
            <h2 className="text-5xl sm:text-6xl font-light leading-tight mb-6">{site.heroSubtitle}</h2>
            <p className="text-sm opacity-60 mb-8 max-w-xs leading-relaxed">{site.tagline}</p>
            <div className="flex gap-4 justify-center md:justify-start">
              {site.bookingEnabled && (
                <a href="#book" className="px-7 py-3 text-xs font-semibold uppercase tracking-widest rounded-full text-white transition-opacity hover:opacity-80"
                  style={{ backgroundColor: accent }}>Book Now</a>
              )}
              <a href="#gallery" className="px-7 py-3 text-xs font-semibold uppercase tracking-widest rounded-full border transition-colors hover:bg-white/50"
                style={{ borderColor: accent, color: accent }}>View Gallery</a>
            </div>
          </div>
          {site.galleryPhotos[0] && (
            <div className="flex-1 max-w-sm">
              <div className="rounded-[3rem] overflow-hidden shadow-2xl shadow-pink-100" style={{ aspectRatio: '3/4' }}>
                <img src={site.galleryPhotos[0].url} alt="" className="w-full h-full object-cover" />
              </div>
            </div>
          )}
        </div>
      </section>

            {/* Gallery */}
      <section id="gallery" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs uppercase tracking-[0.3em] mb-2" style={{ color: accent }}>Portfolio</p>
            <h2 className="text-4xl font-light">Our Beautiful Work</h2>
          </div>
          <PortfolioGallery photos={site.galleryPhotos} studioName={site.heroTitle} accent={accent} />
        </div>
      </section>

      {/* About */}
      <section id="about" className="py-20 px-6" style={{ background: 'linear-gradient(135deg, #FDF0EE 0%, #FDF8F6 100%)' }}>
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.3em] mb-4" style={{ color: accent }}>Our Story</p>
          <h2 className="text-4xl font-light mb-8">About Us</h2>
          <p className="text-lg font-light leading-relaxed opacity-70">{site.about}</p>
          {site.city && <p className="mt-6 text-xs uppercase tracking-widest opacity-40">{site.city}</p>}
          <SocialIcons instagram={site.socialLinks?.instagram} facebook={site.socialLinks?.facebook} youtube={site.socialLinks?.youtube} className="justify-center mt-6" color={accent} />
        </div>
      </section>

      {/* Services */}
      {site.services.length > 0 && (
        <section id="services" className="py-20 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-xs uppercase tracking-[0.3em] mb-2" style={{ color: accent }}>Services</p>
              <h2 className="text-4xl font-light">What We Create</h2>
            </div>
            <div className="grid sm:grid-cols-3 gap-6">
              {site.services.map(s => (
                <div key={s.id} className="p-6 rounded-3xl text-center" style={{ background: '#FDF0EE', border: '1px solid #F0DDD8' }}>
                  <div className="w-10 h-10 rounded-full mx-auto mb-4" style={{ background: `${accent}20` }}>
                    <div className="w-full h-full flex items-center justify-center text-lg" style={{ color: accent }}>✦</div>
                  </div>
                  <h3 className="font-semibold text-sm mb-2">{s.name}</h3>
                  <p className="text-xs leading-relaxed opacity-60">{s.description}</p>
                  {s.price && <p className="mt-3 text-xs font-semibold" style={{ color: accent }}>{s.price}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Book */}
      <section id="book" className="py-20 px-6" style={{ background: 'linear-gradient(135deg, #FDF0EE 0%, #FDF8F6 100%)' }}>
        <div className="max-w-xl mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.3em] mb-4" style={{ color: accent }}>
            {site.bookingEnabled ? 'Book a Session' : 'Say Hello'}
          </p>
          <h2 className="text-4xl font-light mb-10">Let&apos;s Work Together</h2>
          {site.bookingEnabled
            ? <BookingForm subdomain={site.subdomain} message={site.bookingMessage} accentColor={accent} />
            : (
              <div className="space-y-3 text-sm opacity-70">
                {site.contactEmail && <p>✉ {site.contactEmail}</p>}
                {site.contactPhone && <p>☎ {site.contactPhone}</p>}
                {site.whatsapp && <a href={`https://wa.me/${site.whatsapp.replace(/\D/g,'')}`} className="block font-semibold" style={{ color: accent }}>Chat on WhatsApp ♥</a>}
              </div>
            )
          }
        </div>
      </section>

      <footer className="py-8 text-center text-xs opacity-30" style={{ borderTop: '1px solid #F0DDD8' }}>
        {site.heroTitle} · Powered by VayuStudios
      </footer>
    </div>
  )
}
