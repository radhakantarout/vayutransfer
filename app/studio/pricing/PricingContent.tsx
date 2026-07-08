'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import StudioTopupModal from '@/components/studio/StudioTopupModal'
import {
  FREE_STORAGE_BYTES, FREE_DOWNLOAD_BYTES,
  STORAGE_TOPUP_PACKAGES, DOWNLOAD_TOPUP_PACKAGES,
  formatPaiseAsRupees, formatBytesGB,
} from '@/constants/studioPricing'

const FAQS = [
  { q: 'Is there a free trial?', a: 'Every studio starts with a free baseline — 20 GB of storage and 2 GB of downloads every month, no card required.' },
  { q: 'What happens if I go over the free limit?', a: 'We give you a data retention grace period (default 25 days, adjustable in dashboard settings) with reminder emails before anything is touched. Top up any time during that window to stay covered.' },
  { q: 'Is storage a subscription?', a: 'No. Storage top-ups are one-time payments that guarantee your storage limit for a fixed number of months — no recurring charges, no auto-renewal.' },
  { q: 'Do clients pay anything?', a: 'No. Your clients use the gallery, QR code, print delivery, and face search completely free. Only the studio account is billed.' },
  { q: 'Do print-lab downloads count toward my quota?', a: 'Yes — all downloads count toward your monthly quota, whether from your dashboard, a client gallery, guest QR, or a print-lab batch.' },
  { q: 'What payment methods do you accept?', a: 'UPI, NetBanking, Credit/Debit card, and all major Indian payment methods via Razorpay.' },
]

interface Me {
  role: string
  studioId: string | null
}

export default function PricingContent() {
  const [me, setMe] = useState<Me | null>(null)
  const [topupKind, setTopupKind] = useState<'storage' | 'download' | null>(null)

  useEffect(() => {
    fetch('/studio/api/auth/me').then((r) => r.json()).then((res) => {
      if (res.success && res.data) setMe(res.data)
    })
  }, [])

  const canTopUp = !!me && ['ADMIN', 'OWNER'].includes(me.role) && !!me.studioId

  const handleTopUp = (kind: 'storage' | 'download') => {
    if (canTopUp) setTopupKind(kind)
  }

  return (
    <main className="min-h-screen bg-bg">
      {/* Hero */}
      <section className="bg-card border-b border-border py-16 text-center">
        <div className="max-w-2xl mx-auto px-4">
          <span className="inline-block text-accent text-xs font-bold uppercase tracking-widest mb-3 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">Pricing</span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-text-primary mt-3 mb-4">Simple, usage-based pricing</h1>
          <p className="text-muted text-lg leading-relaxed">A generous free baseline for every studio. Pay only when you need more storage or downloads — no subscriptions, no per-seat fees.</p>
        </div>
      </section>

      {/* Free baseline */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <div className="bg-accent/5 border border-accent/30 rounded-2xl p-8 text-center space-y-3">
          <span className="inline-block text-[10px] font-bold text-[#0B0F1A] bg-accent px-2.5 py-0.5 rounded-full">Included free, every studio</span>
          <h2 className="text-2xl font-extrabold text-text-primary">{formatBytesGB(FREE_STORAGE_BYTES)} storage + {formatBytesGB(FREE_DOWNLOAD_BYTES)} downloads / month</h2>
          <p className="text-muted text-sm max-w-md mx-auto">Unlimited projects and clients. Storage is a standing balance; the download allowance resets every calendar month.</p>
          <Link href="/studio/register" className="inline-block bg-accent text-[#0B0F1A] font-bold px-6 py-2.5 rounded-xl hover:bg-accent/90 transition-colors text-sm mt-2">
            Get started free →
          </Link>
        </div>
      </section>

      {/* Storage top-ups */}
      <section className="max-w-4xl mx-auto px-4 pb-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-extrabold text-text-primary">Need more storage?</h2>
          <p className="text-muted text-sm mt-1.5">One-time top-ups, guaranteed for a fixed number of months.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {STORAGE_TOPUP_PACKAGES.map((pkg) => (
            <div key={pkg.id} className={`rounded-2xl border flex flex-col gap-4 p-6 transition-all ${pkg.popular ? 'bg-accent/5 border-accent/40 shadow-xl shadow-accent/10 scale-[1.02]' : 'bg-card border-border'}`}>
              {pkg.popular && <span className="self-start text-[10px] font-bold text-[#0B0F1A] bg-accent px-2.5 py-0.5 rounded-full">Most popular</span>}
              <div>
                <p className="text-lg font-extrabold text-text-primary">{pkg.gb} GB</p>
                <p className="text-muted text-xs mt-0.5">Guaranteed for {pkg.months} months</p>
                <p className="text-3xl font-extrabold text-text-primary mt-3">{formatPaiseAsRupees(pkg.pricePaise)}</p>
              </div>
              <button
                onClick={() => handleTopUp('storage')}
                className={`text-center text-sm font-bold py-3 rounded-xl transition-colors ${pkg.popular ? 'bg-accent text-[#0B0F1A] hover:bg-accent/90' : 'border border-border text-text-primary hover:border-accent/50 hover:text-accent'}`}
              >
                {canTopUp ? 'Top up storage →' : 'Log in to top up →'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Download top-ups */}
      <section className="max-w-4xl mx-auto px-4 pb-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-extrabold text-text-primary">Need more downloads this month?</h2>
          <p className="text-muted text-sm mt-1.5">One-time top-ups, added to this month&apos;s allowance immediately.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {DOWNLOAD_TOPUP_PACKAGES.map((pkg) => (
            <div key={pkg.id} className={`rounded-2xl border flex flex-col gap-4 p-6 transition-all ${pkg.popular ? 'bg-accent/5 border-accent/40 shadow-xl shadow-accent/10 scale-[1.02]' : 'bg-card border-border'}`}>
              {pkg.popular && <span className="self-start text-[10px] font-bold text-[#0B0F1A] bg-accent px-2.5 py-0.5 rounded-full">Most popular</span>}
              <div>
                <p className="text-lg font-extrabold text-text-primary">{pkg.gb} GB</p>
                <p className="text-muted text-xs mt-0.5">Added to this month&apos;s allowance</p>
                <p className="text-3xl font-extrabold text-text-primary mt-3">{formatPaiseAsRupees(pkg.pricePaise)}</p>
              </div>
              <button
                onClick={() => handleTopUp('download')}
                className={`text-center text-sm font-bold py-3 rounded-xl transition-colors ${pkg.popular ? 'bg-accent text-[#0B0F1A] hover:bg-accent/90' : 'border border-border text-text-primary hover:border-accent/50 hover:text-accent'}`}
              >
                {canTopUp ? 'Top up downloads →' : 'Log in to top up →'}
              </button>
            </div>
          ))}
        </div>
        {!canTopUp && (
          <p className="text-center text-xs text-muted mt-6">
            Already have a studio? <Link href="/studio/login" className="text-accent hover:underline font-semibold">Log in</Link> to top up instantly.
          </p>
        )}
      </section>

      {/* What's always included */}
      <section className="bg-card border-y border-border py-14">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-2xl font-extrabold text-text-primary text-center mb-8">Included for every studio</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            {['Unlimited projects','Client gallery + OTP login','Guest QR code','No client app needed'].map((item) => (
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
          <h2 className="text-xl font-extrabold text-text-primary">Ready to get started?</h2>
          <p className="text-muted text-sm">Set up your studio in minutes — free storage and downloads included from day one.</p>
          <Link href="/studio/register" className="inline-block bg-accent text-bg font-bold px-8 py-3.5 rounded-xl hover:bg-accent/90 transition-colors">Create your studio →</Link>
        </div>
      </section>

      {topupKind && (
        <StudioTopupModal
          kind={topupKind}
          onClose={() => setTopupKind(null)}
          onSuccess={() => setTopupKind(null)}
        />
      )}
    </main>
  )
}
