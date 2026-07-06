import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Studio Website — VayuStudios',
  description: 'Your own branded studio website — portfolio, services, booking form, and WhatsApp contact — live on your own subdomain in minutes.',
}

export default function StudioWebsitePage() {
  return (
    <main className="min-h-screen bg-bg">
      {/* Hero */}
      <section className="bg-card border-b border-border py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-6">
            <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
          </div>
          <span className="inline-block text-accent text-xs font-bold uppercase tracking-widest mb-3 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">Product</span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-text-primary mt-3 mb-4">Studio Website</h1>
          <p className="text-muted text-lg max-w-2xl mx-auto leading-relaxed">
            Your own branded booking page — portfolio, services, pricing, and a booking enquiry form — all live on your own subdomain. No developer required.
          </p>
          <div className="flex items-center justify-center gap-4 mt-8 flex-wrap">
            <Link href="/studio/home#get-started" className="bg-accent text-bg font-bold px-8 py-3.5 rounded-xl hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20">Get your website live</Link>
            <Link href="/studio/examples" className="text-accent font-medium hover:underline">See examples →</Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { icon: '🎨', title: '5 designer templates', body: 'Lumina, Clarity, Ember, Bold, and Bloom — pick a look that fits your brand, and switch anytime without losing your content.' },
            { icon: '🖼️', title: 'Portfolio gallery', body: 'Upload your best work by category — Wedding, Portrait, Corporate, and more. A clean gallery, no watermarks.' },
            { icon: '📋', title: 'Services & pricing', body: 'List what you offer with optional pricing, so clients know what to expect before they enquire.' },
            { icon: '📅', title: 'Booking enquiry form', body: 'Clients submit event type, date, and a message directly from your site — you get notified by email instantly.' },
            { icon: '💬', title: 'WhatsApp & social', body: 'A floating WhatsApp button plus Instagram, Facebook, and YouTube links, so clients reach you the way they prefer.' },
            { icon: '🌐', title: 'Your own subdomain', body: 'yourname.vayustudios.com — live in minutes, fully under your studio\'s name.' },
          ].map((f) => (
            <div key={f.title} className="bg-card border border-border rounded-2xl p-5 hover:border-accent/30 transition-all space-y-2">
              <span className="text-2xl">{f.icon}</span>
              <h3 className="font-bold text-text-primary">{f.title}</h3>
              <p className="text-muted text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-card border-y border-border py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-2xl font-extrabold text-text-primary text-center mb-10">How it works</h2>
          <div className="space-y-4">
            {[
              { step: '01', title: 'Pick a template & customise', body: 'Choose one of 5 designs, set your accent and font colour, and add a cover image.' },
              { step: '02', title: 'Add your content', body: 'Hero title, about section, services with pricing, portfolio photos, and contact details.' },
              { step: '03', title: 'Choose your subdomain & publish', body: 'Pick yourname.vayustudios.com, hit Publish, and your site is live.' },
              { step: '04', title: 'Start receiving enquiries', body: 'The booking form sends leads straight to your email and your Bookings dashboard.' },
            ].map(({ step, title, body }) => (
              <div key={step} className="flex gap-5 bg-bg border border-border rounded-2xl p-5">
                <span className="text-3xl font-extrabold text-accent/20 flex-shrink-0 w-10">{step}</span>
                <div>
                  <h3 className="font-bold text-text-primary mb-1">{title}</h3>
                  <p className="text-muted text-sm leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-extrabold text-text-primary mb-3">Ready to launch your studio website?</h2>
        <p className="text-muted text-sm mb-6">Fill in the enquiry form and we&apos;ll set up your studio within 24 hours.</p>
        <Link href="/studio/home#get-started" className="inline-block bg-accent text-bg font-bold px-8 py-4 rounded-xl hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20">Get started →</Link>
      </section>
    </main>
  )
}
