import type { Metadata } from 'next'
import Link from 'next/link'
import { SendIcon } from '@/components/icons'
import { MAX_FILE_SIZE_GB } from '@/constants/pricing'

export const metadata: Metadata = {
  title: 'Transfer Files — VayuTransfer',
  description: `Send files and folders up to ${MAX_FILE_SIZE_GB}GB at a flat ₹4.99/GB. No subscriptions, no hidden fees, unlimited free downloads.`,
}

export default function TransferFilesProductPage() {
  return (
    <main className="min-h-screen bg-bg">
      {/* Hero */}
      <section className="bg-card border-b border-border py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-6">
            <SendIcon className="w-7 h-7 text-accent" />
          </div>
          <span className="inline-block text-accent text-xs font-bold uppercase tracking-widest mb-3 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">Product</span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-text-primary mt-3 mb-4">Transfer Files</h1>
          <p className="text-text-primary/80 text-lg max-w-2xl mx-auto leading-relaxed">
            Drop in a file, a folder, or a whole batch — up to {MAX_FILE_SIZE_GB}GB — and get a secure link back instantly.
            Pay a flat ₹4.99/GB of the exact size you send. No subscriptions, no per-download charges, ever.
          </p>
          <div className="flex items-center justify-center gap-4 mt-8 flex-wrap">
            <Link href="/" className="bg-accent text-bg font-bold px-8 py-3.5 rounded-xl hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20">Start a transfer</Link>
            <Link href="/pricing" className="text-accent font-medium hover:underline">See pricing →</Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { icon: '💸', title: 'Flat, exact pricing', body: 'Just ₹4.99/GB of the real size you send — 100MB costs ₹0.50. No rounding up, no tiers, no monthly plan.' },
            { icon: '📦', title: `Up to ${MAX_FILE_SIZE_GB}GB per transfer`, body: 'Send a single huge file or a whole folder of thousands — one flat rate covers the entire batch.' },
            { icon: '🗂️', title: 'Folder structure preserved', body: 'Drop a folder in and every file uploads individually with its original path intact — no zipping, no flattening.' },
            { icon: '🔄', title: 'Resumable uploads', body: 'If your connection drops mid-upload, it picks up exactly where it stopped instead of starting over.' },
            { icon: '♾️', title: 'Unlimited free downloads', body: 'Anyone with the link can download as many times as they need, however many people, until it expires — no extra charge.' },
            { icon: '🔒', title: 'Secure, expiring links', body: 'Every link is unique and unguessable, and automatically stops working once its retention window ends.' },
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
              { step: '01', title: 'Drop in your files', body: 'Drag a file, a folder, or select multiple items. We show you the exact price before you upload anything.' },
              { step: '02', title: 'Your wallet is charged once', body: 'A flat ₹4.99/GB of the real size, deducted the moment upload begins — never after, never a surprise total.' },
              { step: '03', title: 'Get a shareable link', body: 'Copy it, share it, or email it directly. New accounts start with ₹50 free credit to try this out.' },
              { step: '04', title: 'They download, free', body: 'Anyone with the link downloads directly — no account, no app, unlimited times until the link expires.' },
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
        <h2 className="text-2xl font-extrabold text-text-primary mb-3">Ready to send something?</h2>
        <p className="text-muted text-sm mb-6">Your first ₹50 of transfers is on us.</p>
        <Link href="/" className="inline-block bg-accent text-bg font-bold px-8 py-4 rounded-xl hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20">Start a transfer →</Link>
      </section>
    </main>
  )
}
