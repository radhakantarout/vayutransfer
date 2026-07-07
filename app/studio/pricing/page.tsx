import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Pricing — VayuStudios',
  description: 'Simple, transparent pricing for professional photographers. No hidden fees. Contact us for a quote tailored to your studio.',
}

const TIERS = [
  {
    plan: 'Starter',
    tag: 'Solo photographers',
    price: 'Contact us',
    accent: false,
    features: [
      'Up to 5 active projects',
      'Client gallery with OTP login',
      'Watermarked previews',
      'Photo selection & edit requests',
      'Print delivery links',
      '5 GB cloud storage',
      'Email support',
    ],
  },
  {
    plan: 'Studio',
    tag: 'Busy studios',
    price: 'Contact us',
    accent: true,
    popular: true,
    features: [
      'Unlimited active projects',
      'Everything in Starter',
      'Guest QR Code',
      'AI Face Search',
      'Multi-user team (Admin + Print)',
      '50 GB cloud storage',
      'Priority support',
    ],
  },
  {
    plan: 'Enterprise',
    tag: 'Large studios & chains',
    price: 'Custom',
    accent: false,
    features: [
      'Custom storage quota',
      'Everything in Studio',
      'Custom branding & subdomain',
      'Dedicated onboarding',
      'SLA-backed support',
      'API access',
      'Bulk event management',
    ],
  },
]

const FAQS = [
  { q: 'Is there a free trial?', a: 'Yes — we set up your studio and give you a trial period to test with a real shoot before committing.' },
  { q: 'What counts as a "project"?', a: 'Each shoot or event is one project. A wedding, a pre-wedding session, and a portrait shoot are three separate projects.' },
  { q: 'Can I upgrade later?', a: 'Absolutely. You can move from Starter to Studio at any time. We migrate your existing projects automatically.' },
  { q: 'Is storage per project or shared?', a: 'Storage is shared across all your projects within the plan quota. Upgrade anytime if you need more.' },
  { q: 'Do clients pay anything?', a: 'No. Your clients use the gallery, QR code, and face search completely free. You pay the studio subscription.' },
  { q: 'What payment methods do you accept?', a: 'UPI, NetBanking, Credit/Debit card, and all major Indian payment methods via Razorpay.' },
]

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-bg">
      {/* Hero */}
      <section className="bg-card border-b border-border py-16 text-center">
        <div className="max-w-2xl mx-auto px-4">
          <span className="inline-block text-accent text-xs font-bold uppercase tracking-widest mb-3 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">Pricing</span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-text-primary mt-3 mb-4">Simple, honest pricing</h1>
          <p className="text-muted text-lg leading-relaxed">No per-seat fees. No hidden charges. Pay for your studio — your clients use everything free.</p>
        </div>
      </section>

      {/* Tiers */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {TIERS.map((tier) => (
            <div key={tier.plan} className={`rounded-2xl border flex flex-col gap-5 p-6 transition-all ${tier.accent ? 'bg-accent/5 border-accent/40 shadow-xl shadow-accent/10 scale-[1.02]' : 'bg-card border-border'}`}>
              {tier.popular && <span className="self-start text-[10px] font-bold text-[#0B0F1A] bg-accent px-2.5 py-0.5 rounded-full">Most popular</span>}
              <div>
                <h2 className={`text-xl font-extrabold ${tier.accent ? 'text-accent' : 'text-text-primary'}`}>{tier.plan}</h2>
                <p className="text-muted text-xs mt-0.5">{tier.tag}</p>
                <p className="text-3xl font-extrabold text-text-primary mt-3">{tier.price}</p>
              </div>
              <ul className="space-y-2.5 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted">
                    <svg className={`w-4 h-4 flex-shrink-0 mt-0.5 ${tier.accent ? 'text-accent' : 'text-muted'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M5 13l4 4L19 7"/></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/studio/get-started" className={`text-center text-sm font-bold py-3 rounded-xl transition-colors ${tier.accent ? 'bg-accent text-[#0B0F1A] hover:bg-accent/90' : 'border border-border text-text-primary hover:border-accent/50 hover:text-accent'}`}>
                Get a quote →
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-muted mt-8">All plans include free setup, onboarding, and team training. Pricing in INR.</p>
      </section>

      {/* What's always included */}
      <section className="bg-card border-y border-border py-14">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-2xl font-extrabold text-text-primary text-center mb-8">Included in every plan</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            {['Free setup & onboarding','India-based servers','OTP client login','No client app needed'].map((item) => (
              <div key={item} className="bg-bg border border-border rounded-xl p-4">
                <svg className="w-5 h-5 text-accent mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M5 13l4 4L19 7"/></svg>
                <p className="text-xs font-medium text-text-primary">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-extrabold text-text-primary text-center mb-10">Frequently asked questions</h2>
        <div className="space-y-3">
          {FAQS.map(({ q, a }) => (
            <div key={q} className="bg-card border border-border rounded-2xl p-5">
              <h3 className="font-bold text-text-primary text-sm mb-1.5">{q}</h3>
              <p className="text-muted text-sm leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-2xl mx-auto px-4 pb-20 text-center">
        <div className="bg-accent/5 border border-accent/20 rounded-2xl p-8 space-y-4">
          <h2 className="text-xl font-extrabold text-text-primary">Ready to get a quote?</h2>
          <p className="text-muted text-sm">Fill in the form and we&apos;ll send you a tailored pricing proposal within 24 hours.</p>
          <Link href="/studio/get-started" className="inline-block bg-accent text-bg font-bold px-8 py-3.5 rounded-xl hover:bg-accent/90 transition-colors">Contact us for pricing →</Link>
        </div>
      </section>
    </main>
  )
}
