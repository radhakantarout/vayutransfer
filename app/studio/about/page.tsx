import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'About Us — VayuStudios',
  description: 'VayuStudios is a professional photo gallery delivery platform built for Indian photographers and studios.',
}

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-bg">
      <section className="bg-card border-b border-border py-20">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <span className="inline-block text-accent text-xs font-bold uppercase tracking-widest mb-3 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">About us</span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-text-primary mt-3 mb-4">Their memories. Instantly connected.</h1>
          <p className="text-muted text-lg leading-relaxed">
            VayuStudios is a photo gallery delivery platform built specifically for Indian professional photographers — because the existing tools weren&apos;t built with our clients in mind.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 py-16 space-y-8">
        <div className="bg-card border border-border rounded-2xl p-7">
          <h2 className="text-xl font-extrabold text-text-primary mb-3">Why we built this</h2>
          <p className="text-muted text-sm leading-relaxed">
            Indian wedding photographers shoot thousands of photos per event. Sharing them meant WeTransfer links, Google Drive folders, or WhatsApp — none built for the client experience. Clients had no way to select photos, request edits, or find themselves in a crowd. We built VayuStudios to fix all of that in one product.
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-7">
          <h2 className="text-xl font-extrabold text-text-primary mb-3">India-first by design</h2>
          <p className="text-muted text-sm leading-relaxed">
            Our servers are in Mumbai. Client login is phone OTP — because that&apos;s how India authenticates. Pricing is in INR. Our event calendar covers every Indian occasion from Navratri to Onam to corporate annual days. We&apos;re not adapting a global product — we built this from scratch for Indian photographers.
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-7">
          <h2 className="text-xl font-extrabold text-text-primary mb-3">Part of VayuTransfer</h2>
          <p className="text-muted text-sm leading-relaxed">
            VayuStudios is the professional photography arm of VayuTransfer — India&apos;s prepaid file transfer platform. The same infrastructure that powers secure file sharing for thousands of users powers the storage and delivery behind VayuStudios.
          </p>
          <a href="https://vayutransfer.com" target="_blank" rel="noopener noreferrer" className="inline-block mt-3 text-accent text-sm font-semibold hover:underline">Visit VayuTransfer →</a>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          {[
            { value: '500+', label: 'Photographers' },
            { value: '50K+', label: 'Photos delivered' },
            { value: '6',    label: 'Event categories' },
            { value: '100%', label: 'India-hosted' },
          ].map(({ value, label }) => (
            <div key={label} className="bg-card border border-border rounded-2xl p-5">
              <div className="text-2xl font-extrabold text-accent">{value}</div>
              <div className="text-muted text-xs mt-1">{label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-2xl mx-auto px-4 pb-20 text-center">
        <div className="bg-accent/5 border border-accent/20 rounded-2xl p-8 space-y-4">
          <h2 className="text-xl font-extrabold text-text-primary">Want to work with us?</h2>
          <p className="text-muted text-sm">We&apos;re always open to partnerships, feedback, and conversations with photographers.</p>
          <Link href="/studio/get-started" className="inline-block bg-accent text-bg font-bold px-8 py-3.5 rounded-xl hover:bg-accent/90 transition-colors">Get in touch →</Link>
        </div>
      </section>
    </main>
  )
}
