// Template: Clarity — Minimal white, editorial
import type { StudioWebsite } from '@/types/studio'
import BookingForm from './BookingForm'
import PortfolioGallery from './PortfolioGallery'
import SocialIcons from './SocialIcons'

export default function Clarity({ site }: { site: StudioWebsite }) {
  const accent = site.themeAccent ?? '#1A1A1A'

  return (
    <div className="min-h-screen bg-white text-gray-900" style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-bold text-sm tracking-widest uppercase">{site.heroTitle}</span>
          <nav className="hidden sm:flex items-center gap-8 text-xs uppercase tracking-widest text-gray-500">
            <a href="#work" className="hover:text-gray-900 transition-colors">Work</a>
            <a href="#about" className="hover:text-gray-900 transition-colors">About</a>
            <a href="#services" className="hover:text-gray-900 transition-colors">Services</a>
            {site.bookingEnabled && <a href="#book" className="hover:text-gray-900 transition-colors">Contact</a>}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-20">
        {site.galleryPhotos[0] ? (
          <div className="relative h-[90vh]">
            <img src={site.galleryPhotos[0].url} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/20" />
            <div className="absolute bottom-12 left-12">
              <h1 className="text-5xl sm:text-7xl font-light text-white leading-none">{site.heroTitle}</h1>
              <p className="text-white/70 mt-4 text-lg font-light">{site.heroSubtitle}</p>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-6 pt-24 pb-16">
            <h1 className="text-5xl sm:text-7xl font-light leading-none mb-6">{site.heroTitle}</h1>
            <p className="text-xl text-gray-500 font-light">{site.heroSubtitle}</p>
          </div>
        )}
      </section>

      {/* Gallery */}
      <section id="work" className="py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-8">Selected Work</p>
          <PortfolioGallery photos={site.galleryPhotos} studioName={site.heroTitle} accent={accent} />
        </div>
      </section>

      {/* About */}
      <section id="about" className="py-24 px-6 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-6">About</p>
          <p className="text-2xl font-light leading-relaxed text-gray-700">{site.about}</p>
          {site.city && <p className="mt-8 text-sm text-gray-400 uppercase tracking-widest">{site.city}</p>}
        </div>
      </section>

      {/* Services */}
      {site.services.length > 0 && (
        <section id="services" className="py-24 px-6">
          <div className="max-w-4xl mx-auto">
            <p className="text-xs uppercase tracking-widest text-gray-400 mb-12">Services</p>
            <div className="divide-y divide-gray-100">
              {site.services.map(s => (
                <div key={s.id} className="py-8 grid sm:grid-cols-3 gap-4">
                  <h3 className="font-semibold text-sm uppercase tracking-wider">{s.name}</h3>
                  <p className="text-gray-600 text-sm sm:col-span-2 leading-relaxed">{s.description}
                    {s.price && <span className="block mt-1 text-gray-400 text-xs">{s.price}</span>}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Booking */}
      <section id="book" className="py-24 px-6 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-4">
            {site.bookingEnabled ? 'Book a Session' : 'Contact'}
          </p>
          <h2 className="text-3xl font-light mb-10">Get in touch</h2>
          {site.bookingEnabled
            ? (
              <div style={{ '--accent': accent } as React.CSSProperties}>
                <BookingFormLight subdomain={site.subdomain} message={site.bookingMessage} accent={accent} />
              </div>
            )
            : (
              <div className="space-y-3 text-sm text-gray-600">
                {site.contactEmail && <p>{site.contactEmail}</p>}
                {site.contactPhone && <p>{site.contactPhone}</p>}
                {site.whatsapp && <p><a href={`https://wa.me/${site.whatsapp.replace(/\D/g,'')}`} className="underline">WhatsApp</a></p>}
              </div>
            )
          }
        </div>
      </section>

      <footer className="py-8 px-6 border-t border-gray-100 text-center">
        <SocialIcons instagram={site.socialLinks?.instagram} facebook={site.socialLinks?.facebook} youtube={site.socialLinks?.youtube} className="justify-center mb-3 text-gray-400" iconClassName="hover:!opacity-100 text-gray-400 hover:text-gray-700" />
        <p className="text-xs text-gray-300">{site.heroTitle} · Powered by VayuStudios</p>
      </footer>
    </div>
  )
}

// Light version of booking form for white background
function BookingFormLight({ subdomain, message, accent }: { subdomain: string; message?: string; accent: string }) {
  // Re-use base form but pass light styling via inline override — we import the dark one and wrap
  return (
    <div className="[&_input]:bg-gray-100 [&_input]:border-gray-200 [&_input]:text-gray-900 [&_select]:bg-gray-100 [&_select]:border-gray-200 [&_select]:text-gray-900 [&_textarea]:bg-gray-100 [&_textarea]:border-gray-200 [&_textarea]:text-gray-900 [&_input::placeholder]:text-gray-400 [&_textarea::placeholder]:text-gray-400 [&_label]:text-gray-700">
      <BookingForm subdomain={subdomain} message={message} accentColor={accent} textOnAccent="#fff" />
    </div>
  )
}
