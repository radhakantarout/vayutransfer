'use client'

import { useState } from 'react'
import Link from 'next/link'

const faqs = [
  {
    q: 'How does the wallet work?',
    a: 'You load credits into your wallet using Razorpay (UPI, cards, netbanking). Your wallet is debited before each upload begins — ensuring you always know the cost upfront. Your balance never expires.',
  },
  {
    q: 'Is storage under 500 MB really free?',
    a: 'Yes. Files under 500 MB are completely free — zero storage cost and unlimited downloads included.',
  },
  {
    q: 'What happens if my upload fails?',
    a: 'If an upload fails or you cancel mid-way, your wallet is automatically refunded. The refund is instant — no waiting, no support ticket needed.',
  },
  {
    q: 'How long does my link stay active?',
    a: 'All shareable links expire after 24 hours. After expiry, the file is automatically deleted from our servers and the link returns a 404.',
  },
  {
    q: 'Do recipients need an account to download?',
    a: 'No. Anyone with the link can download the file directly — no sign-up required. Each download counts toward the limit you set at upload time.',
  },
  {
    q: 'How many people can download my file?',
    a: 'You choose when you upload. Set it to 3 and exactly 3 people can download — after that the link closes automatically. For files above 500 MB, each download is priced by file size (₹14 for 500 MB–2 GB, up to ₹101 for 5–10 GB).',
  },
  {
    q: 'What file types and sizes are supported?',
    a: 'Any file type is supported. Maximum file size is 10 GB per transfer. Files are uploaded in 50 MB chunks directly to AWS S3 Mumbai.',
  },
  {
    q: 'Is my data stored securely?',
    a: 'Yes. Files are stored on AWS S3 (ap-south-1, Mumbai) with server-side encryption. Links are unique and unguessable. Files are automatically deleted after 24 hours.',
  },
  {
    q: 'Can I get a refund to my bank account?',
    a: 'Wallet credits are non-refundable to bank accounts — they can only be used for transfers. If you have unused balance and need assistance, contact us at support@vayutransfer.com.',
  },
  {
    q: 'Why is my payment failing?',
    a: 'Ensure your UPI app or card supports international transactions if using VPN. Try a different payment method in Razorpay. If the issue persists, email us with your order ID.',
  },
]

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-card/60 transition-colors"
      >
        <span className="font-medium text-text-primary text-sm pr-4">{q}</span>
        <span className={`text-accent flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-45' : ''}`}>
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </span>
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-muted leading-relaxed border-t border-border pt-3">
          {a}
        </div>
      )}
    </div>
  )
}

export default function SupportPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-16 space-y-14">

      {/* Hero */}
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-extrabold text-text-primary">How can we help?</h1>
        <p className="text-muted text-lg">Find answers to common questions or reach us directly.</p>
      </div>

      {/* Contact options */}
      <div className="max-w-sm mx-auto">
        <a
          href="mailto:support@vayutransfer.com"
          className="flex items-center gap-4 bg-card border border-border hover:border-accent rounded-2xl p-5 transition-colors group"
        >
          <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0 group-hover:bg-accent/20 transition-colors">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>
          <div>
            <div className="font-semibold text-text-primary text-sm">Email Support</div>
            <div className="text-muted text-xs mt-0.5">support@vayutransfer.com</div>
            <div className="text-muted text-xs mt-0.5">Response within 24 hours</div>
          </div>
        </a>
      </div>

      {/* FAQ */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-text-primary">Frequently Asked Questions</h2>
        <div className="space-y-3">
          {faqs.map((faq) => (
            <FAQItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
        </div>
      </div>

      {/* Still need help */}
      <div className="bg-accent/5 border border-accent/20 rounded-2xl p-8 text-center space-y-3">
        <h3 className="font-bold text-text-primary text-lg">Still need help?</h3>
        <p className="text-muted text-sm">
          Email us at{' '}
          <a href="mailto:support@vayutransfer.com" className="text-accent hover:underline">
            support@vayutransfer.com
          </a>{' '}
          with your issue and we&apos;ll get back to you within 24 hours.
        </p>
        <Link
          href="/"
          className="inline-block mt-2 bg-accent text-bg font-bold px-6 py-3 rounded-xl text-sm hover:bg-accent/90 transition-colors"
        >
          Back to Transfer Files
        </Link>
      </div>

    </main>
  )
}
