'use client'

import { useState } from 'react'
import Link from 'next/link'

const faqs = [
  {
    q: 'How does the wallet work?',
    a: 'You load credits into your wallet using Razorpay (UPI, cards, netbanking). Your wallet is debited before each upload begins — ensuring you always know the cost upfront. Your balance never expires.',
  },
  {
    q: 'How much does a transfer cost?',
    a: 'A flat ₹4.99/GB, calculated to the exact size of your file — send 100MB and pay for 100MB, no rounding up to a full GB. There\'s no free tier or monthly limit; new accounts just start with ₹50 free credit to use like any other wallet balance.',
  },
  {
    q: 'What happens if my upload fails?',
    a: 'If an upload fails or you cancel mid-way, your wallet is automatically refunded. The refund is instant — no waiting, no support ticket needed.',
  },
  {
    q: 'What if my browser refreshes or crashes while I\'m uploading a big batch?',
    a: 'Go back to My Transfers — a paused upload shows up there with a "Paused" badge and how many files already made it through. Click it to re-select the same file or folder and pick up exactly where you left off, at no extra charge. You\'re only ever billed for what actually finishes uploading: anything left incomplete is automatically refunded, either when you choose to finish without it or, if you never come back, on its own after a few hours. We also warn you before letting the tab close or refresh while something is actively uploading.',
  },
  {
    q: 'How long does my link stay active?',
    a: 'You choose 3, 7, or 15 days when you upload, and can extend it later up to 19 days total. After it expires, the file is automatically deleted and the link stops working.',
  },
  {
    q: 'Do recipients need an account to download?',
    a: 'No. Anyone with the link can download the file directly — no sign-up required, and downloads are unlimited until the link expires.',
  },
  {
    q: 'How many people can download my file?',
    a: 'As many as you like — downloads are unlimited and free until your link expires. There\'s no per-download charge or download-count limit to configure.',
  },
  {
    q: 'What file types and sizes are supported?',
    a: 'Any file type is supported. Maximum file size is 400 GB per transfer, and folders upload with their structure intact. Files are uploaded in 50 MB chunks directly to secure cloud storage.',
  },
  {
    q: 'Is my data stored securely?',
    a: 'Yes. Files are stored with server-side encryption on secure cloud storage (Mumbai region). Links are unique and unguessable. Files are automatically deleted once your chosen retention period (3, 7, or 15 days, extendable up to 19) ends.',
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
        <p className="text-text-primary/80 text-lg">Find answers to common questions or reach us directly.</p>
      </div>

      {/* Contact options */}
      <div className="max-w-sm mx-auto space-y-3">
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
        <a
          href="https://wa.me/918984769522"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 bg-card border border-border hover:border-[#25D366]/60 rounded-2xl p-5 transition-colors group"
        >
          <div className="w-10 h-10 rounded-full bg-[#25D366]/10 flex items-center justify-center flex-shrink-0 group-hover:bg-[#25D366]/20 transition-colors">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#25D366]" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.07L2 22l5.07-1.38C8.42 21.5 10.15 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm4.64 13.71c-.19.54-1.14 1.04-1.57 1.1-.43.07-.97.1-1.56-.1-.36-.12-.82-.27-1.41-.53-2.47-1.07-4.08-3.56-4.2-3.72-.12-.16-1-1.33-1-2.54 0-1.21.63-1.8.86-2.05.22-.25.49-.31.65-.31h.47c.15 0 .35-.06.55.43.2.48.68 1.67.74 1.79.06.12.1.26.02.42-.08.16-.12.26-.24.4-.12.14-.25.31-.36.42-.12.12-.24.25-.1.49.14.24.62 1.03 1.33 1.66.92.82 1.69 1.07 1.93 1.19.24.12.38.1.52-.06.14-.16.6-.7.76-.94.16-.24.32-.2.54-.12.22.08 1.4.66 1.64.78.24.12.4.18.46.28.06.1.06.58-.13 1.11z"/>
            </svg>
          </div>
          <div>
            <div className="font-semibold text-text-primary text-sm">WhatsApp Support</div>
            <div className="text-muted text-xs mt-0.5">Chat with our team directly</div>
            <div className="text-muted text-xs mt-0.5">Fastest for urgent issues</div>
          </div>
        </a>
        <p className="text-center text-xs text-muted pt-1">
          Or use the chat assistant in the bottom-right corner for instant answers to common questions.
        </p>
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
