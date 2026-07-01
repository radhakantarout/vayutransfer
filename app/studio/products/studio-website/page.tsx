import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Studio Website — VayuStudios',
  description: 'Your own branded studio website with portfolio, booking form, and enquiry management. Coming soon to VayuStudios.',
}

export default function StudioWebsitePage() {
  return (
    <main className="min-h-screen bg-bg">
      <section className="bg-card border-b border-border py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-6">
            <svg className="w-7 h-7 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
          </div>
          <div className="flex items-center justify-center gap-3 mb-3">
            <span className="inline-block text-orange-400 text-xs font-bold uppercase tracking-widest px-3 py-1 bg-orange-500/10 border border-orange-500/20 rounded-full">Coming Soon</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-text-primary mt-3 mb-4">Studio Website</h1>
          <p className="text-muted text-lg max-w-2xl mx-auto leading-relaxed">
            Your own branded booking page — portfolio, pricing, enquiry form, and availability calendar — all under your studio name. No developer required.
          </p>
          <Link href="/studio/home#get-started" className="inline-block mt-8 border border-accent/40 text-accent font-bold px-8 py-3.5 rounded-xl hover:bg-accent/10 transition-colors">Join the waitlist</Link>
        </div>
      </section>

      {/* Planned features */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-extrabold text-text-primary text-center mb-4">What we&apos;re building</h2>
        <p className="text-muted text-sm text-center mb-10 max-w-xl mx-auto">These are the features planned for Studio Website. Early access members will shape the final product.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { icon: '🌐', title: 'Custom subdomain', body: 'yourname.vayustudios.com — or bring your own domain. Your brand, your URL.' },
            { icon: '🖼️', title: 'Portfolio gallery', body: 'Showcase your best work by category. Linked directly to your VayuStudios showcase galleries.' },
            { icon: '📋', title: 'Booking enquiry form', body: 'Clients submit shoot date, event type, and budget. You respond and convert — all inside VayuStudios.' },
            { icon: '💰', title: 'Pricing page', body: 'Display your packages clearly. Fully customisable — hide prices and show "Contact for quote" instead.' },
            { icon: '📅', title: 'Availability calendar', body: 'Show blocked dates so clients know when you\'re free before they even enquire.' },
            { icon: '⭐', title: 'Reviews & testimonials', body: 'Display client testimonials with photo. Builds trust before the first call.' },
          ].map((f) => (
            <div key={f.title} className="bg-card border border-border border-dashed rounded-2xl p-5 space-y-2 opacity-80">
              <span className="text-2xl">{f.icon}</span>
              <h3 className="font-bold text-text-primary">{f.title}</h3>
              <p className="text-muted text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-2xl mx-auto px-4 pb-16 text-center">
        <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-8 space-y-4">
          <h2 className="text-xl font-extrabold text-text-primary">Be the first to know when it launches</h2>
          <p className="text-muted text-sm">Fill in the studio enquiry form and mention Studio Website — we&apos;ll add you to the early access list.</p>
          <Link href="/studio/home#get-started" className="inline-block bg-accent text-bg font-bold px-8 py-3.5 rounded-xl hover:bg-accent/90 transition-colors">Join the waitlist →</Link>
        </div>
      </section>
    </main>
  )
}
