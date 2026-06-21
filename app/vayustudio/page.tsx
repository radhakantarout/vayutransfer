import type { Metadata } from 'next'
import Link from 'next/link'
import EnquiryForm from './EnquiryForm'

export const metadata: Metadata = {
  title: 'VayuStudio — Professional Photo Galleries for Photographers',
  description: 'Upload photos, share a secure gallery with clients, let them select favourites, and send straight to print. Built for Indian wedding and event photographers.',
}

const STEPS = [
  {
    number: '01',
    title: 'Upload your photos',
    body: 'Drag and drop your full-resolution files. Watermarked previews are generated automatically — clients see the work, not the raws.',
  },
  {
    number: '02',
    title: 'Share with your client',
    body: 'One secure link. Clients log in with their phone number (OTP — no app install). They browse, select favourites, and mark photos for retouching.',
  },
  {
    number: '03',
    title: 'Send to print',
    body: 'Upload your edited finals. Generate a 7-day signed print link for your lab. They download exactly what they need — edited or original.',
  },
]

const FEATURES = [
  { icon: '🔒', title: 'Watermarked previews', body: 'Clients browse beautiful watermarked previews. Original files never leave your control.' },
  { icon: '📱', title: 'OTP client login', body: 'No passwords, no app install. Clients authenticate with their phone in seconds.' },
  { icon: '✏️', title: 'Editing requests', body: 'Clients flag photos that need retouching and leave per-photo comments.' },
  { icon: '🖨️', title: 'Secure print downloads', body: '7-day CloudFront-signed links for your print lab. Original files stay private on S3.' },
  { icon: '📁', title: 'Multi-project dashboard', body: 'Manage all your shoots in one place. See selection status at a glance.' },
  { icon: '🇮🇳', title: 'Built for India', body: 'Phone OTP via AWS SNS, Indian payment support, servers in Mumbai.' },
]

const EVENT_TYPES = ['Wedding', 'Pre-wedding', 'Corporate', 'School & college', 'Portfolio', 'Fashion']

export default function VayuStudioPage() {
  return (
    <main>
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/20 text-accent text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
          <span className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
          For photographers &amp; studios
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-text-primary leading-tight mb-5">
          Professional galleries<br />your clients will love
        </h1>
        <p className="text-muted text-lg max-w-2xl mx-auto leading-relaxed mb-8">
          Upload photos, share a secure gallery, let clients pick their favourites, and send straight to your print lab.
          Zero friction. Zero compromise on quality.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <a
            href="#get-started"
            className="bg-accent text-bg font-bold px-7 py-3.5 rounded-xl hover:bg-accent/90 transition-colors text-sm"
          >
            Get your studio setup
          </a>
          <a
            href="#how-it-works"
            className="text-muted hover:text-text-primary text-sm transition-colors"
          >
            See how it works →
          </a>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-card border-y border-border py-16">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold text-text-primary">How it works</h2>
            <p className="text-muted mt-2">Three steps from upload to print</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((step) => (
              <div key={step.number} className="bg-bg border border-border rounded-2xl p-6 space-y-3">
                <div className="text-4xl font-extrabold text-accent/20">{step.number}</div>
                <h3 className="font-bold text-text-primary text-lg">{step.title}</h3>
                <p className="text-muted text-sm leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold text-text-primary">Everything you need</h2>
          <p className="text-muted mt-2">Purpose-built for professional photographers</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-card border border-border rounded-2xl p-5 space-y-2">
              <div className="text-2xl">{f.icon}</div>
              <h3 className="font-semibold text-text-primary">{f.title}</h3>
              <p className="text-muted text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Event types */}
      <section className="bg-card border-y border-border py-14">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-extrabold text-text-primary mb-3">Perfect for every shoot</h2>
          <p className="text-muted text-sm mb-8">VayuStudio works for all kinds of professional photography</p>
          <div className="flex flex-wrap justify-center gap-3">
            {EVENT_TYPES.map((t) => (
              <span key={t} className="bg-bg border border-border text-text-primary text-sm font-medium px-4 py-2 rounded-full">
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison / Why VayuStudio */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-text-primary">Why photographers choose VayuStudio</h2>
        </div>
        <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
          {[
            { point: 'No client app downloads',         detail: 'OTP login on any phone browser' },
            { point: 'Originals stay safe',             detail: 'Clients only ever see watermarked previews' },
            { point: 'Direct to print workflow',        detail: 'Signed download links for your lab, no middleman' },
            { point: 'Editing requests built in',       detail: 'Clients flag specific photos and add comments' },
            { point: 'All shoots in one dashboard',     detail: 'Track status — Draft → Active → Selection received → Completed' },
            { point: 'India-first infrastructure',      detail: 'AWS Mumbai (ap-south-1), SNS OTP, INR pricing' },
          ].map(({ point, detail }) => (
            <div key={point} className="flex items-start gap-4 px-6 py-4">
              <span className="text-success font-bold text-lg flex-shrink-0">✓</span>
              <div>
                <div className="text-text-primary font-medium text-sm">{point}</div>
                <div className="text-muted text-xs mt-0.5">{detail}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing note */}
      <section className="max-w-3xl mx-auto px-4 pb-10">
        <div className="bg-accent/5 border border-accent/20 rounded-2xl p-8 text-center space-y-3">
          <h2 className="text-xl font-bold text-text-primary">Transparent pricing. No surprise bills.</h2>
          <p className="text-muted text-sm leading-relaxed max-w-xl mx-auto">
            VayuStudio is a managed service — we set up your studio, onboard your team, and support you throughout.
            Pricing is based on storage used and number of projects. Get in touch for a quote.
          </p>
          <a href="#get-started" className="inline-block text-accent text-sm font-semibold hover:underline mt-1">
            Contact us for pricing →
          </a>
        </div>
      </section>

      {/* Contact form */}
      <section id="get-started" className="max-w-2xl mx-auto px-4 pb-20">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-extrabold text-text-primary">Get your studio setup</h2>
          <p className="text-muted mt-2 text-sm">Fill in the form and we&apos;ll reach out within 24 hours.</p>
        </div>
        <EnquiryForm />
      </section>

      {/* Studio login link */}
      <div className="text-center pb-10">
        <p className="text-xs text-muted">
          Already have a studio account?{' '}
          <Link href="/studio/login" className="text-accent hover:underline">Sign in to VayuStudio →</Link>
        </p>
      </div>
    </main>
  )
}
