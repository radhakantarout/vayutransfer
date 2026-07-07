import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'AI Face Search — VayuStudios',
  description: 'Clients find every photo of themselves with a single selfie. Powered by AI face recognition — no scrolling through thousands of shots.',
}

export default function AISearchPage() {
  return (
    <main className="min-h-screen bg-bg">
      {/* Hero */}
      <section className="bg-card border-b border-border py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-6">
            <svg className="w-7 h-7 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="8" r="4"/><path strokeLinecap="round" d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/><path strokeLinecap="round" d="M19 3l1 1-1 1M21 5h-2"/></svg>
          </div>
          <span className="inline-block text-violet-400 text-xs font-bold uppercase tracking-widest mb-3 px-3 py-1 bg-violet-500/10 border border-violet-500/20 rounded-full">AI Powered</span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-text-primary mt-3 mb-4">AI Face Search</h1>
          <p className="text-muted text-lg max-w-2xl mx-auto leading-relaxed">
            Your client takes a selfie. Our AI scans thousands of event photos and surfaces every single shot they appear in — in seconds. No endless scrolling required.
          </p>
          <div className="flex items-center justify-center gap-4 mt-8 flex-wrap">
            <Link href="/studio/get-started" className="bg-accent text-bg font-bold px-8 py-3.5 rounded-xl hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20">Enable AI search</Link>
            <Link href="/studio/products/guest-qr" className="text-accent font-medium hover:underline">See Guest QR Code →</Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-extrabold text-text-primary text-center mb-10">How AI search works</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { step: '1', title: 'You upload', body: 'Upload your event photos to VayuStudios. Our Lambda function indexes every face automatically.' },
            { step: '2', title: 'Client takes a selfie', body: 'From the gallery or QR landing page, the client taps "Find my photos" and takes a quick selfie.' },
            { step: '3', title: 'AI matches instantly', body: 'Face vectors are compared across the entire event. Matches are ranked by confidence score.' },
            { step: '4', title: 'Client sees their photos', body: 'Only their matching photos are shown — watermarked previews, ready to heart or request edits.' },
          ].map(({ step, title, body }) => (
            <div key={step} className="bg-card border border-border rounded-2xl p-5 hover:border-violet-500/30 transition-all">
              <div className="w-8 h-8 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 font-extrabold text-sm flex items-center justify-center mb-3">{step}</div>
              <h3 className="font-bold text-accent text-sm mb-1">{title}</h3>
              <p className="text-muted text-xs leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="bg-card border-y border-border py-16">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-2xl font-extrabold text-text-primary text-center mb-10">Why photographers love it</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { title: 'Works across 10,000+ photos', body: 'Index massive wedding or corporate events. AI handles the scale so you don\'t have to.' },
              { title: 'No app, no install', body: 'Runs entirely in the browser via your VayuStudios gallery link. Clients need nothing but their phone.' },
              { title: 'Group photo detection', body: 'Finds the client\'s face even in large group shots, panoramas, and candid crowd photos.' },
              { title: 'Confidence scoring', body: 'High-confidence matches are shown first. Lower-confidence suggestions are clearly marked.' },
              { title: 'Watermarks intact', body: 'AI search shows the same watermarked previews — original files stay completely protected.' },
              { title: 'Paired with Guest QR', body: 'Works seamlessly with the Guest QR Code product for instant event-day face search at the venue.' },
            ].map((f) => (
              <div key={f.title} className="bg-bg border border-border rounded-2xl p-5 hover:border-violet-500/30 transition-all space-y-2">
                <div className="w-2 h-2 rounded-full bg-violet-400" />
                <h3 className="font-bold text-text-primary text-sm">{f.title}</h3>
                <p className="text-muted text-xs leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-extrabold text-text-primary mb-3">Let your clients find themselves</h2>
        <p className="text-muted text-sm mb-6">Set up AI face search for your studio today.</p>
        <Link href="/studio/get-started" className="inline-block bg-accent text-bg font-bold px-8 py-4 rounded-xl hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20">Get started →</Link>
      </section>
    </main>
  )
}
