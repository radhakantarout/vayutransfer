import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Print Delivery — VayuStudios',
  description: 'Generate secure 7-day download links for your print lab. Edited finals delivered directly — no middleman, no exposed originals.',
}

export default function PrintDeliveryPage() {
  return (
    <main className="min-h-screen bg-bg">
      <section className="bg-card border-b border-border py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-6">
            <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>
          </div>
          <span className="inline-block text-green-400 text-xs font-bold uppercase tracking-widest mb-3 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full">Product</span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-text-primary mt-3 mb-4">Print Delivery</h1>
          <p className="text-muted text-lg max-w-2xl mx-auto leading-relaxed">
            Upload your edited finals. Generate a 7-day secure download link and send it straight to your print lab. No email attachments. No WeTransfer. No risk.
          </p>
          <Link href="/studio/get-started" className="inline-block mt-8 bg-accent text-bg font-bold px-8 py-3.5 rounded-xl hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20">Get started</Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 py-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {[
          { icon: '📤', title: 'Upload edited finals', body: 'Upload your retouched originals directly to the project. The edited version is stored separately from the preview.' },
          { icon: '🔗', title: '7-day secure link', body: 'One click generates a time-limited, signed download link. Send it to your lab — it works only for that window.' },
          { icon: '🏭', title: 'Lab downloads with confidence', body: 'Your lab gets exactly the files they need — full resolution, no compression, no middleman.' },
          { icon: '🔒', title: 'Originals stay private', body: 'Client-facing gallery still shows watermarked previews. Print links expose only the edited finals to the lab.' },
          { icon: '✅', title: 'Edited vs original', body: 'For each photo the system uses the edited version when available, otherwise the original. No manual sorting.' },
          { icon: '⏱', title: 'Link expiry control', body: 'Links expire automatically. Re-generate anytime if the lab needs more time. Old links stop working instantly.' },
        ].map((f) => (
          <div key={f.title} className="bg-card border border-border rounded-2xl p-5 hover:border-green-500/30 transition-all space-y-2">
            <span className="text-2xl">{f.icon}</span>
            <h3 className="font-bold text-text-primary">{f.title}</h3>
            <p className="text-muted text-sm leading-relaxed">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="max-w-2xl mx-auto px-4 pb-16 text-center">
        <div className="bg-card border border-green-500/20 rounded-2xl p-8 space-y-4">
          <h2 className="text-xl font-extrabold text-text-primary">Streamline your lab workflow</h2>
          <p className="text-muted text-sm">No more email attachments or Google Drive headaches.</p>
          <Link href="/studio/get-started" className="inline-block bg-accent text-bg font-bold px-8 py-3.5 rounded-xl hover:bg-accent/90 transition-colors">Get started →</Link>
        </div>
      </section>
    </main>
  )
}
