import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Client Gallery — VayuStudios',
  description: 'Deliver beautiful watermarked photo galleries to your clients. OTP login, photo selection, editing requests — no app needed.',
}

export default function ClientGalleryPage() {
  return (
    <main className="min-h-screen bg-bg">
      {/* Hero */}
      <section className="bg-card border-b border-border py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-6">
            <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path strokeLinecap="round" d="M21 15l-5-5L5 21"/></svg>
          </div>
          <span className="inline-block text-accent text-xs font-bold uppercase tracking-widest mb-3 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">Product</span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-text-primary mt-3 mb-4">Client Gallery</h1>
          <p className="text-muted text-lg max-w-2xl mx-auto leading-relaxed">
            Your clients browse watermarked previews, select their favourites, and request edits — all from a single secure link. No app. No password. Just a phone number.
          </p>
          <div className="flex items-center justify-center gap-4 mt-8 flex-wrap">
            <Link href="/studio/get-started" className="bg-accent text-bg font-bold px-8 py-3.5 rounded-xl hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20">Get your gallery setup</Link>
            <Link href="/studio/examples" className="text-accent font-medium hover:underline">See examples →</Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { icon: '🔒', title: 'Watermarked previews', body: 'Every photo shown to the client carries your studio watermark. The original high-res file never leaves your control.' },
            { icon: '📱', title: 'OTP login — no app', body: 'Clients enter their phone number, get an OTP, and are in. No download, no account creation, no friction.' },
            { icon: '❤️', title: 'One-tap selections', body: 'Clients tap the heart to mark keepers and the pencil for retouching. You see every selection update live on your dashboard.' },
            { icon: '💬', title: 'Per-photo comments', body: 'Clients tap the 3-dot menu on any photo to leave a specific retouching note. No more vague WhatsApp messages.' },
            { icon: '🔗', title: 'One secure link', body: 'Share a single link that only works for the intended client. Revoke access anytime from your dashboard.' },
            { icon: '📊', title: 'Live selection tracking', body: 'Your dashboard shows exactly how many photos are selected, how many edits requested, and client comments in real time.' },
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
              { step: '01', title: 'You upload photos to your project', body: 'Drag in your full-res files. Watermarked previews are generated automatically.' },
              { step: '02', title: 'Share the gallery link with your client', body: 'One link. Client logs in with their phone OTP — no app, no password.' },
              { step: '03', title: 'Client browses and selects', body: 'They heart their favourites, flag retouches, leave comments on specific photos.' },
              { step: '04', title: 'You see everything on your dashboard', body: 'Live view of all selections and comments. Deliver exactly what was asked for.' },
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
        <h2 className="text-2xl font-extrabold text-text-primary mb-3">Ready to deliver better galleries?</h2>
        <p className="text-muted text-sm mb-6">Fill in the enquiry form and we'll set up your studio within 24 hours.</p>
        <Link href="/studio/get-started" className="inline-block bg-accent text-bg font-bold px-8 py-4 rounded-xl hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20">Get started →</Link>
      </section>
    </main>
  )
}
