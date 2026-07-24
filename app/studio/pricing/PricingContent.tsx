'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatPaiseAsRupees } from '@/constants/studioPricing'

// UI-only mockup of a capacity-based pricing model, reflecting the R2
// storage migration (zero egress fees → downloads are no longer a metered
// cost) and the real AI-search-credit system already live in the product.
// Deliberately kept separate from constants/studioPricing.ts (the real,
// wired-up top-up billing config) — this page is a redesign to review
// before any of it is actually wired to Razorpay/plan enforcement.
//
// Philosophy: while VayuStudios is still growing its studio base, every
// plan — including Free — gets the full feature set. The only thing that
// differs between plans is storage and AI search capacity (and, for
// Custom, a few dedicated-support extras). Layout: three equal-size,
// centered pricing cards, with a "Client Gallery" / "Website Management"
// feature checklist off to the side rather than repeated on every card.

const FREE_STORAGE_GB = 5
const FREE_AI_CREDITS = 200

// Pro's dynamic pricing — a base price that includes a default amount of
// storage and AI search, with linear per-unit pricing for anything beyond
// that. Margins check out against real AWS/Cloudflare costs: storage nets
// ~51% margin (₹3/GB sold vs ~₹1.45/GB R2 cost), AI credits net ~68%
// (₹0.30/photo sold vs ~₹0.10/photo Rekognition cost) — both comfortably
// inside the 50-60% target.
const PRO_BASE_PRICE_PAISE = 99900 // ₹999
const PRO_BASE_STORAGE_GB = 100
const PRO_BASE_AI_CREDITS = 500
const PRO_STORAGE_MAX_GB = 1000 // shown as "1 TB"
const PRO_STORAGE_STEP_GB = 50
const PRO_STORAGE_EXTRA_PAISE_PER_100GB = 30000 // ₹300
const PRO_AI_MAX_CREDITS = 10000
const PRO_AI_STEP_CREDITS = 500
const PRO_AI_EXTRA_PAISE_PER_1000 = 30000 // ₹300

function computeProPricePaise(storageGB: number, aiCredits: number): number {
  const storageExtraGB = Math.max(0, storageGB - PRO_BASE_STORAGE_GB)
  const aiExtraCredits = Math.max(0, aiCredits - PRO_BASE_AI_CREDITS)
  const storageExtraPaise = Math.round((storageExtraGB / 100) * PRO_STORAGE_EXTRA_PAISE_PER_100GB)
  const aiExtraPaise = Math.round((aiExtraCredits / 1000) * PRO_AI_EXTRA_PAISE_PER_1000)
  return PRO_BASE_PRICE_PAISE + storageExtraPaise + aiExtraPaise
}

const formatStorage = (v: number) => (v >= 1000 ? '1 TB' : `${v} GB`)
const formatAi = (v: number) => `${v.toLocaleString('en-IN')} photos`

// Same top-up notes shown on both Pro and Custom cards — built from the
// real per-unit rates so the copy can't drift out of sync with the modal.
const TOPUP_STORAGE_NOTE = `Top up storage anytime — +${formatPaiseAsRupees(PRO_STORAGE_EXTRA_PAISE_PER_100GB)} per 100 GB`
const TOPUP_AI_NOTE = `Top up AI search anytime — +${formatPaiseAsRupees(PRO_AI_EXTRA_PAISE_PER_1000)} per 1,000 photos`

interface Feature { label: string; customOnly?: boolean }

const CLIENT_GALLERY_FEATURES: Feature[] = [
  { label: 'Unlimited client galleries & sharing' },
  { label: 'Unlimited downloads for clients & guests' },
  { label: 'Guest QR code + selfie search' },
  { label: 'Client favorites & selections' },
  { label: 'Custom watermark branding' },
  { label: 'Password-protected sharing' },
  { label: 'AI photo sorting & grouping' },
  { label: 'RAW & video transfer to your editor, with live progress tracking' },
]

const WEBSITE_MANAGEMENT_FEATURES: Feature[] = [
  { label: 'Custom studio website' },
  { label: 'One-click online booking' },
  { label: 'Automatic booking notifications' },
  { label: 'Team member logins' },
  { label: 'White-label custom domain', customOnly: true },
  { label: 'Dedicated priority support', customOnly: true },
  { label: 'Dedicated account manager', customOnly: true },
]

const FAQS = [
  { q: 'Why does Free get every feature?', a: 'We’re a growing platform — every studio gets full access to every feature, including AI search, custom watermarking, and your own booking website, right from the Free plan. You only ever pay for extra storage or AI search capacity, never to unlock a feature.' },
  { q: 'Is there a free trial?', a: `Yes — every studio starts on Free, with ${FREE_STORAGE_GB} GB of storage and ${FREE_AI_CREDITS} AI photo searches, no credit card required, no time limit.` },
  { q: 'How does Pro’s pricing work?', a: `Pro starts at ${formatPaiseAsRupees(PRO_BASE_PRICE_PAISE)}/month, which includes ${PRO_BASE_STORAGE_GB} GB of storage and ${PRO_BASE_AI_CREDITS} AI photo searches. Use the "Check price" calculator to see the cost for more of either — it's +₹300 per 100 GB of storage and +₹300 per 1,000 AI photo searches.` },
  { q: 'Are downloads really unlimited and free on every plan?', a: 'Yes. Our storage runs on zero-egress-fee cloud infrastructure, so however many times your clients, guests, or print lab download photos, it never costs you extra — on Free, Pro, and Custom alike.' },
  { q: 'What happens if I go over my storage or AI limit?', a: 'We give you a data retention grace period (default 25 days, adjustable in dashboard settings) with reminder emails before anything is touched. Top up, or move to a bigger Pro configuration, any time during that window to stay covered.' },
  { q: 'Do AI search credits roll over, or refund if I delete a project?', a: 'Credits are used the moment a photo is indexed for AI search, so they don’t roll over month to month. Deleting a project afterward doesn’t refund credits already spent on it, since that AI work already happened.' },
  { q: 'Can I change my storage or AI search amount later?', a: 'Yes — adjust it anytime from your dashboard billing settings and the price updates automatically from your next billing cycle. No plan-switching, no long-term lock-in.' },
  { q: 'Do clients or guests pay anything?', a: 'No. Your clients and guests use the gallery, QR code, print delivery, and face search completely free. Only the studio account is billed.' },
  { q: 'What payment methods do you accept?', a: 'UPI, NetBanking, Credit/Debit card, and all major Indian payment methods via Razorpay.' },
]

function CheckIcon() {
  return <svg className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
}
function CloseIcon()     { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg> }
function GalleryIcon()   { return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="3" width="13" height="13" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M8 21h9a2 2 0 002-2V8"/></svg> }
function GlobeIcon()     { return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="9"/><path strokeLinecap="round" d="M3 12h18M12 3a14 14 0 014 9 14 14 0 01-4 9 14 14 0 01-4-9 14 14 0 014-9z"/></svg> }
function TopupIcon()     { return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M12 3l1.5 1.5M12 3L10.5 4.5M12 3v4"/></svg> }
function MeterIcon()     { return <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 12l4-3M12 3v2M4.2 8L6 9M19.8 8L18 9"/></svg> }
function ShieldIcon()    { return <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.4-2.9 8.1-7 9.5C7.9 19.1 5 15.4 5 11V6l7-3z"/><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4"/></svg> }
function NoLockIcon()    { return <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="4" y="10.5" width="16" height="10" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M8 10.5V7a4 4 0 017.6-1.8"/><circle cx="12" cy="15.5" r="1.5"/></svg> }

const VALUE_PROPS = [
  { title: 'Pay for what you use', sub: 'Storage and AI search scale to your real usage — never a flat fee for capacity you don’t need.', icon: <MeterIcon /> },
  { title: 'No hidden charges', sub: 'Downloads, sharing, and every feature are included. The price you see is the price you pay.', icon: <ShieldIcon /> },
  { title: 'No commitment', sub: 'Monthly billing, cancel or adjust anytime — no contracts, no lock-in.', icon: <NoLockIcon /> },
  { title: 'Top up anytime', sub: 'Not sure about your monthly usage? Start with the defaults and top up storage or AI search the moment you need more.', icon: <TopupIcon /> },
]

function SliderRow({ label, value, onChange, max, step, formatValue, baseValue }: {
  label: string; value: number; onChange: (v: number) => void; max: number; step: number
  formatValue: (v: number) => string; baseValue: number
}) {
  // min is the included/default amount, not 0 — Pro's ₹999 base already
  // covers that much, so the slider only ever moves you up from there,
  // never below what's already included in the price.
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-text-primary">{label}</span>
        <span className="font-bold text-accent">{formatValue(value)}</span>
      </div>
      <input type="range" min={baseValue} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full accent-accent cursor-pointer" />
      <div className="flex items-center justify-between text-[10px] text-muted">
        <span>Included: {formatValue(baseValue)}</span>
        <span>{formatValue(max)}</span>
      </div>
    </div>
  )
}

function ProCalculatorModal({ onClose, annual }: { onClose: () => void; annual: boolean }) {
  const [storageGB, setStorageGB] = useState(PRO_BASE_STORAGE_GB)
  const [aiCredits, setAiCredits] = useState(PRO_BASE_AI_CREDITS)

  const monthlyPaise = computeProPricePaise(storageGB, aiCredits)
  const displayPaise = annual ? monthlyPaise * 10 : monthlyPaise // 10x = "2 months free" annual discount
  const perMonthPaise = Math.round(displayPaise / (annual ? 12 : 1))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-text-primary">Dial in your Pro plan</h3>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-text-primary hover:bg-border/60 transition-colors">
            <CloseIcon />
          </button>
        </div>

        <div>
          <p className="text-4xl font-extrabold text-text-primary">
            {formatPaiseAsRupees(perMonthPaise)}<span className="text-sm font-medium text-muted">/mo</span>
          </p>
          <p className="text-[11px] text-muted mt-1">
            Starts at {formatPaiseAsRupees(PRO_BASE_PRICE_PAISE)} · {annual ? `billed ${formatPaiseAsRupees(displayPaise)} annually` : 'billed monthly'}
          </p>
        </div>

        <div className="space-y-4">
          <SliderRow label="Storage" value={storageGB} onChange={setStorageGB}
            max={PRO_STORAGE_MAX_GB} step={PRO_STORAGE_STEP_GB}
            formatValue={formatStorage} baseValue={PRO_BASE_STORAGE_GB} />
          <SliderRow label="AI photo search / month" value={aiCredits} onChange={setAiCredits}
            max={PRO_AI_MAX_CREDITS} step={PRO_AI_STEP_CREDITS}
            formatValue={formatAi} baseValue={PRO_BASE_AI_CREDITS} />
        </div>

        <p className="text-[11px] text-muted bg-bg border border-border rounded-lg px-2.5 py-2">
          +₹300 per 100 GB, +₹300 per 1,000 AI searches beyond what&apos;s included. Not sure how much you&apos;ll need? You can adjust or top up anytime after signing up too.
        </p>

        <Link href="/studio/register"
          className="block text-center text-sm font-bold py-3 rounded-xl bg-accent text-[#0B0F1A] hover:bg-accent/90 transition-colors">
          Get started at this price →
        </Link>
      </div>
    </div>
  )
}

function CardShell({ children, highlight }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`relative h-full rounded-3xl border flex flex-col gap-5 p-7 transition-all hover:-translate-y-1 ${
      highlight
        ? 'bg-gradient-to-b from-accent/10 to-transparent border-accent/50 shadow-2xl shadow-accent/10 hover:shadow-accent/20'
        : 'bg-card border-border hover:border-accent/30 hover:shadow-xl hover:shadow-black/5'
    }`}>
      {children}
    </div>
  )
}

function IncludedNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-xs text-text-primary">
      <CheckIcon />
      <span>{children}</span>
    </p>
  )
}

function FreeCard() {
  return (
    <CardShell>
      <div>
        <h3 className="text-lg font-extrabold text-text-primary">Free</h3>
        <p className="text-xs text-muted mt-1 leading-snug min-h-[2rem]">Every feature, on us, while you try VayuStudios</p>
      </div>
      <div>
        <p className="text-4xl font-extrabold text-text-primary">₹0<span className="text-sm font-medium text-muted">/mo</span></p>
        <p className="text-[11px] text-muted mt-1">No credit card required</p>
      </div>
      <div className="space-y-1.5 pb-1 border-b border-border/70">
        <p className="text-sm font-bold text-text-primary">{FREE_STORAGE_GB} GB storage</p>
        <p className="text-sm font-bold text-text-primary">{FREE_AI_CREDITS} AI photo searches</p>
      </div>
      <div className="flex-1 space-y-2">
        <IncludedNote>Every Client Gallery &amp; Website Management feature included</IncludedNote>
      </div>
      <Link href="/studio/register"
        className="text-center text-sm font-bold py-3 rounded-xl border border-border text-text-primary hover:border-accent/50 hover:text-accent transition-colors">
        Start free →
      </Link>
    </CardShell>
  )
}

function ProCard({ onCheckPrice }: { onCheckPrice: () => void }) {
  return (
    <CardShell highlight>
      <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold text-[#0B0F1A] bg-accent px-3 py-1 rounded-full whitespace-nowrap shadow">
        RECOMMENDED
      </span>
      <div>
        <h3 className="text-lg font-extrabold text-text-primary">Pro</h3>
        <p className="text-xs text-muted mt-1 leading-snug min-h-[2rem]">Scales with your studio as you grow</p>
      </div>
      <div>
        <p className="text-4xl font-extrabold text-text-primary">
          {formatPaiseAsRupees(PRO_BASE_PRICE_PAISE)}<span className="text-sm font-medium text-muted">/mo</span>
        </p>
        <p className="text-[11px] text-muted mt-1">Billed monthly</p>
      </div>
      <div className="space-y-1.5 pb-1 border-b border-border/70">
        <p className="text-sm font-bold text-text-primary">{PRO_BASE_STORAGE_GB} GB storage</p>
        <p className="text-sm font-bold text-text-primary">{PRO_BASE_AI_CREDITS} AI photo searches / mo</p>
      </div>
      <button type="button" onClick={onCheckPrice}
        className="text-left text-xs font-semibold text-accent hover:underline -mt-2">
        Looking for more storage or AI search? Check price →
      </button>
      <div className="flex-1 space-y-2">
        <IncludedNote>Every Client Gallery &amp; Website Management feature included</IncludedNote>
        <IncludedNote>{TOPUP_STORAGE_NOTE}</IncludedNote>
        <IncludedNote>{TOPUP_AI_NOTE}</IncludedNote>
      </div>
      <Link href="/studio/register"
        className="text-center text-sm font-bold py-3 rounded-xl bg-accent text-[#0B0F1A] hover:bg-accent/90 transition-colors">
        Get started →
      </Link>
    </CardShell>
  )
}

function CustomCard() {
  return (
    <CardShell>
      <div>
        <h3 className="text-lg font-extrabold text-text-primary">Custom</h3>
        <p className="text-xs text-muted mt-1 leading-snug min-h-[2rem]">For high-volume studios &amp; studio chains</p>
      </div>
      <div>
        <p className="text-4xl font-extrabold text-text-primary">Custom</p>
        <p className="text-[11px] text-muted mt-1">Pricing built around your studio&apos;s volume</p>
      </div>
      <div className="space-y-1.5 pb-1 border-b border-border/70">
        <p className="text-sm font-bold text-text-primary">Storage sized to you</p>
        <p className="text-sm font-bold text-text-primary">AI search sized to you</p>
      </div>
      <div className="flex-1 space-y-2">
        <IncludedNote>Everything, plus dedicated priority support &amp; an account manager</IncludedNote>
        <IncludedNote>{TOPUP_STORAGE_NOTE}</IncludedNote>
        <IncludedNote>{TOPUP_AI_NOTE}</IncludedNote>
      </div>
      <Link href="/studio/help"
        className="text-center text-sm font-bold py-3 rounded-xl border border-border text-text-primary hover:border-accent/50 hover:text-accent transition-colors">
        Talk to sales →
      </Link>
    </CardShell>
  )
}

function FeaturePanelSection({ icon, label, features }: { icon: React.ReactNode; label: string; features: Feature[] }) {
  return (
    <div className="mb-8 last:mb-0">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-accent">{icon}</span>
        <h3 className="text-sm font-extrabold text-text-primary">{label}</h3>
      </div>
      <ul className="space-y-2.5">
        {features.map((f) => (
          <li key={f.label} className="flex items-start gap-2 text-xs text-muted leading-snug">
            <CheckIcon />
            <span>
              {f.label}
              {f.customOnly && (
                <span className="ml-1.5 inline-block text-[9px] font-bold text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded-full align-middle whitespace-nowrap">
                  Custom plan
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function PricingContent() {
  const [annual, setAnnual] = useState(false)
  const [showCalculator, setShowCalculator] = useState(false)

  return (
    <main className="min-h-screen bg-bg">
      {/* Hero */}
      <section className="bg-card border-b border-border py-20 text-center">
        <div className="max-w-2xl mx-auto px-4">
          <span className="inline-block text-accent text-xs font-bold uppercase tracking-widest mb-4 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">Pricing</span>
          <h1 className="text-4xl sm:text-6xl font-extrabold text-text-primary mt-3 mb-5 leading-[1.1]">
            Every feature, <span className="text-accent">on every plan</span>
          </h1>
          <p className="text-muted text-lg leading-relaxed">Start free with the full toolkit. Pay only for the storage and AI photo search you actually need — nothing is ever locked behind a higher tier.</p>
        </div>
      </section>

      {/* Value props */}
      <section className="max-w-6xl mx-auto px-4 py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-4">
          {VALUE_PROPS.map(({ title, sub, icon }) => (
            <div key={title} className="flex flex-col items-center text-center gap-3 px-2">
              <span className="w-12 h-12 flex items-center justify-center rounded-2xl bg-accent/10 border border-accent/20 text-accent flex-shrink-0">
                {icon}
              </span>
              <div>
                <p className="text-sm font-extrabold text-text-primary">{title}</p>
                <p className="text-xs text-muted leading-relaxed mt-1">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing cards + feature panel */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        {/* Monthly / annual toggle */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <span className={`text-sm font-semibold ${!annual ? 'text-text-primary' : 'text-muted'}`}>Monthly</span>
          <button type="button" onClick={() => setAnnual(v => !v)}
            className={`relative w-11 h-6 rounded-full transition-colors ${annual ? 'bg-accent' : 'bg-border'}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${annual ? 'translate-x-5' : ''}`} />
          </button>
          <span className={`text-sm font-semibold flex items-center gap-1.5 ${annual ? 'text-text-primary' : 'text-muted'}`}>
            Annual
            <span className="text-[10px] font-bold text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded-full">2 months free</span>
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-10 items-start">
          {/* Feature panel — left side */}
          <div className="order-2 lg:order-1">
            <FeaturePanelSection icon={<GalleryIcon />} label="Client Gallery" features={CLIENT_GALLERY_FEATURES} />
            <FeaturePanelSection icon={<GlobeIcon />} label="Website Management" features={WEBSITE_MANAGEMENT_FEATURES} />
          </div>

          {/* Pricing cards — centered in the remaining space */}
          <div className="order-1 lg:order-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto items-stretch">
              <FreeCard />
              <ProCard onCheckPrice={() => setShowCalculator(true)} />
              <CustomCard />
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-muted mt-10 max-w-lg mx-auto">
          Storage covers everything your gallery needs — client-ready previews and full-resolution originals — under one simple number, no separate meters to track.
          AI search credits are used the moment a photo is indexed; deleting a project afterward doesn&apos;t refund credits already spent on it.
        </p>
      </section>

      {/* Why downloads are free */}
      <section className="max-w-4xl mx-auto px-4 pb-16">
        <div className="bg-accent/5 border border-accent/25 rounded-2xl p-8 text-center space-y-3">
          <span className="inline-block text-[10px] font-bold text-[#0B0F1A] bg-accent px-2.5 py-0.5 rounded-full">No download fees, ever</span>
          <h2 className="text-2xl font-extrabold text-text-primary">Unlimited downloads on every plan</h2>
          <p className="text-muted text-sm max-w-xl mx-auto leading-relaxed">
            Our entire storage infrastructure runs on zero-egress-fee cloud storage, so however many times your clients, guests, or print lab download photos, it never adds to your bill — free on Free, and every plan above it.
          </p>
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
          <p className="text-muted text-sm">Set up your studio in minutes — every feature is included from day one.</p>
          <Link href="/studio/register" className="inline-block bg-accent text-bg font-bold px-8 py-3.5 rounded-xl hover:bg-accent/90 transition-colors">Create your studio →</Link>
        </div>
      </section>

      {showCalculator && (
        <ProCalculatorModal onClose={() => setShowCalculator(false)} annual={annual} />
      )}
    </main>
  )
}
