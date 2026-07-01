import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Guest QR Code — VayuStudios',
  description: 'Place a QR code at your event. Guests scan, enter their phone, and instantly find every photo of themselves.',
}

export default function GuestQRPage() {
  return (
    <main className="min-h-screen bg-bg">
      {/* Hero */}
      <section className="bg-card border-b border-border py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-6">
            <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="3" width="5" height="5" rx="0.5"/><rect x="16" y="3" width="5" height="5" rx="0.5"/><rect x="3" y="16" width="5" height="5" rx="0.5"/><path strokeLinecap="round" d="M16 16h2v2h-2zM19 19h2v2h-2zM16 19h1M19 16h2"/></svg>
          </div>
          <span className="inline-block text-accent text-xs font-bold uppercase tracking-widest mb-3 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">Product</span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-text-primary mt-3 mb-4">Guest QR Code</h1>
          <p className="text-muted text-lg max-w-2xl mx-auto leading-relaxed">
            Place a printed QR code at the venue. Guests scan it, enter their phone number, and instantly see every photo in which they appear — powered by AI face matching.
          </p>
          <div className="flex items-center justify-center gap-4 mt-8 flex-wrap">
            <Link href="/studio/home#get-started" className="bg-accent text-bg font-bold px-8 py-3.5 rounded-xl hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20">Enable for my studio</Link>
            <Link href="/studio/products/ai-search" className="text-accent font-medium hover:underline">See AI Face Search →</Link>
          </div>
        </div>
      </section>

      {/* Perfect for */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-extrabold text-text-primary text-center mb-10">Perfect for every event</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {['Weddings','Sangeet','Reception','Corporate Events','School Events','Fashion Shows'].map((e) => (
            <div key={e} className="bg-card border border-border rounded-xl px-3 py-4 text-center hover:border-accent/40 transition-all">
              <p className="text-xs font-semibold text-text-primary leading-snug">{e}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="bg-card border-y border-border py-16">
        <div className="max-w-5xl mx-auto px-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
          {[
            { icon: '📲', title: 'Scan & find in seconds', body: 'Guests scan the QR at the venue, enter their phone OTP, and see only their own photos. No scrolling through 2,000 shots.' },
            { icon: '🤖', title: 'AI-powered face matching', body: 'Our AI cross-matches the guest\'s selfie against every photo in the event gallery. Accuracy improves with the full-res original.' },
            { icon: '🖨️', title: 'Print-ready QR cards', body: 'Download a print-ready QR card from your dashboard. Place at tables, on frames, or include in welcome kits.' },
            { icon: '🔒', title: 'Private by design', body: 'Each guest only sees photos of themselves. Watermarks stay on. Full-res originals are never exposed.' },
            { icon: '📸', title: 'Works across all formats', body: 'Wedding, candid, group shots — the AI finds the guest\'s face across every image type uploaded to the event.' },
            { icon: '📊', title: 'Guest analytics', body: 'See how many guests scanned, how many photos were viewed, and which moments were most popular.' },
          ].map((f) => (
            <div key={f.title} className="flex gap-4 bg-bg border border-border rounded-2xl p-5 hover:border-accent/30 transition-all">
              <span className="text-2xl flex-shrink-0">{f.icon}</span>
              <div>
                <h3 className="font-bold text-text-primary mb-1">{f.title}</h3>
                <p className="text-muted text-sm leading-relaxed">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-extrabold text-text-primary text-center mb-10">How it works at an event</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { step: '1', title: 'You upload the event photos', body: 'Upload to your VayuStudios event project. AI indexing runs in the background.' },
            { step: '2', title: 'Place the QR at the venue', body: 'Download the QR card from your dashboard and print. Place on tables, entrance, or banners.' },
            { step: '3', title: 'Guests scan and find themselves', body: 'Guests scan, verify with OTP, take a quick selfie, and see every photo of themselves instantly.' },
          ].map(({ step, title, body }) => (
            <div key={step} className="bg-card border border-border rounded-2xl p-6 text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-accent/10 border border-accent/20 text-accent font-extrabold text-lg flex items-center justify-center mx-auto">{step}</div>
              <h3 className="font-bold text-accent">{title}</h3>
              <p className="text-muted text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-2xl mx-auto px-4 pb-16 text-center">
        <div className="bg-card border border-accent/20 rounded-2xl p-8 space-y-4">
          <h2 className="text-xl font-extrabold text-text-primary">Delight every guest at your next event</h2>
          <p className="text-muted text-sm">Get your studio set up with Guest QR today.</p>
          <Link href="/studio/home#get-started" className="inline-block bg-accent text-bg font-bold px-8 py-3.5 rounded-xl hover:bg-accent/90 transition-colors">Get started →</Link>
        </div>
      </section>
    </main>
  )
}
