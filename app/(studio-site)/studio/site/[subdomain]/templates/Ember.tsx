// Template: Ember — Warm earth tones, soft and inviting
import type { StudioWebsite } from '@/types/studio'
import BookingForm from './BookingForm'
import PortfolioGallery from './PortfolioGallery'
import SocialIcons from './SocialIcons'

export default function Ember({ site }: { site: StudioWebsite }) {
  const accent = site.themeAccent ?? '#C4622D'

  return (
    <div className="min-h-screen" style={{ background: '#FAF6F1', color: '#2C1810', fontFamily: '"Palatino Linotype", Palatino, serif' }}>

      {/* Nav */}
      <header className="py-6 px-8 flex items-center justify-between" style={{ borderBottom: '1px solid #E8DDD5' }}>
        <div>
          <span className="text-xl font-semibold">{site.heroTitle}</span>
          {site.tagline && <span className="text-xs ml-3 opacity-50">{site.tagline}</span>}
        </div>
        <nav className="hidden sm:flex gap-8 text-sm" style={{ color: '#8B6655' }}>
          <a href="#gallery" className="hover:opacity-70 transition-opacity">Gallery</a>
          <a href="#about" className="hover:opacity-70 transition-opacity">Story</a>
          <a href="#services" className="hover:opacity-70 transition-opacity">Services</a>
          {site.bookingEnabled && <a href="#book" style={{ color: accent }} className="font-semibold hover:opacity-70 transition-opacity">Book Now</a>}
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: '80vh' }}>
        {site.galleryPhotos[0] ? (
          <>
            <img src={site.galleryPhotos[0].url} alt="" className="w-full h-full object-cover absolute inset-0" style={{ minHeight: '80vh', opacity: 0.85 }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(250,246,241,0.9) 40%, transparent 100%)' }} />
          </>
        ) : (
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #F5EDE3 0%, #E8D5C4 100%)' }} />
        )}
        <div className="relative z-10 max-w-2xl px-10 py-24 flex flex-col justify-center" style={{ minHeight: '80vh' }}>
          <p className="text-xs uppercase tracking-[0.25em] mb-4" style={{ color: accent }}>Photography</p>
          <h1 className="text-5xl sm:text-7xl font-light leading-tight mb-6">{site.heroTitle}</h1>
          <p className="text-lg leading-relaxed mb-8 opacity-70">{site.heroSubtitle}</p>
          {site.bookingEnabled && (
            <a href="#book" className="self-start px-8 py-3.5 text-sm font-semibold rounded-full text-white transition-opacity hover:opacity-80"
              style={{ backgroundColor: accent }}>Book a Session →</a>
          )}
        </div>
      </section>

            {/* Gallery */}
      <section id="gallery" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-light text-center mb-12">Our Work</h2>
          <PortfolioGallery photos={site.galleryPhotos} studioName={site.heroTitle} accent={accent} />
        </div>
      </section>

      {/* About */}
      <section id="about" className="py-20 px-6" style={{ background: '#F0E8DF' }}>
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          {site.galleryPhotos[1] && (
            <div className="rounded-3xl overflow-hidden" style={{ aspectRatio: '3/4' }}>
              <img src={site.galleryPhotos[1].url} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-widest mb-4" style={{ color: accent }}>Our Story</p>
            <h2 className="text-3xl font-light mb-6">About Us</h2>
            <p className="leading-relaxed opacity-70 text-sm">{site.about}</p>
            {site.city && <p className="mt-6 text-xs uppercase tracking-widest opacity-40">{site.city}</p>}
            <SocialIcons instagram={site.socialLinks?.instagram} facebook={site.socialLinks?.facebook} youtube={site.socialLinks?.youtube} className="mt-6" color={accent} />
          </div>
        </div>
      </section>

      {/* Services */}
      {site.services.length > 0 && (
        <section id="services" className="py-20 px-6">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-light text-center mb-14">What We Offer</h2>
            <div className="grid sm:grid-cols-3 gap-6">
              {site.services.map((s, i) => (
                <div key={s.id} className="rounded-2xl p-6" style={{ background: i % 2 === 0 ? '#F0E8DF' : '#FAF6F1', border: '1px solid #E8DDD5' }}>
                  <h3 className="font-semibold mb-2 text-sm">{s.name}</h3>
                  <p className="text-xs leading-relaxed opacity-60">{s.description}</p>
                  {s.price && <p className="mt-3 text-xs font-semibold" style={{ color: accent }}>{s.price}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Book */}
      <section id="book" className="py-20 px-6" style={{ background: '#F0E8DF' }}>
        <div className="max-w-xl mx-auto text-center">
          <p className="text-xs uppercase tracking-widest mb-3" style={{ color: accent }}>
            {site.bookingEnabled ? 'Book a Session' : 'Get in Touch'}
          </p>
          <h2 className="text-3xl font-light mb-10">Let&apos;s create memories together</h2>
          {site.bookingEnabled
            ? <BookingForm subdomain={site.subdomain} message={site.bookingMessage} accentColor={accent} />
            : (
              <div className="space-y-3 text-sm opacity-70">
                {site.contactEmail && <p>✉ {site.contactEmail}</p>}
                {site.contactPhone && <p>☎ {site.contactPhone}</p>}
                {site.whatsapp && <a href={`https://wa.me/${site.whatsapp.replace(/\D/g,'')}`} className="block underline" style={{ color: accent }}>Chat on WhatsApp</a>}
              </div>
            )
          }
        </div>
      </section>

      <footer className="py-8 px-6 text-center text-xs opacity-40" style={{ borderTop: '1px solid #E8DDD5' }}>
        {site.heroTitle} · Powered by VayuStudios
      </footer>
    </div>
  )
}
