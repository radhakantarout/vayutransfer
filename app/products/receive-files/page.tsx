import type { Metadata } from 'next'
import Link from 'next/link'
import { InboxIcon } from '@/components/icons'
import { MAX_FILE_SIZE_GB } from '@/constants/pricing'

export const metadata: Metadata = {
  title: 'Receive Files — VayuTransfer',
  description: 'Request files from anyone — they upload straight into your wallet-funded storage, no account needed on their end.',
}

export default function ReceiveFilesProductPage() {
  return (
    <main className="min-h-screen bg-bg">
      {/* Hero */}
      <section className="bg-card border-b border-border py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-6">
            <InboxIcon className="w-7 h-7 text-accent" />
          </div>
          <span className="inline-block text-accent text-xs font-bold uppercase tracking-widest mb-3 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">Product</span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-text-primary mt-3 mb-4">Receive Files</h1>
          <p className="text-text-primary/80 text-lg max-w-2xl mx-auto leading-relaxed">
            Need something from a client, a colleague, or a stranger? Generate a request link and send it to anyone —
            they upload directly into your storage. No account, no app, nothing for them to sign up for.
          </p>
          <div className="flex items-center justify-center gap-4 mt-8 flex-wrap">
            <Link href="/transfer/request" className="bg-accent text-bg font-bold px-8 py-3.5 rounded-xl hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20">Request files now</Link>
            <Link href="/pricing" className="text-accent font-medium hover:underline">See pricing →</Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { icon: '🙅', title: 'No account for them', body: "Whoever you're requesting from just clicks the link and uploads — no sign-up, no password, nothing to install." },
            { icon: '📏', title: 'You set the size cap', body: `Choose how much you're willing to accept, up to ${MAX_FILE_SIZE_GB}GB total across everything they send.` },
            { icon: '⏳', title: 'You set the expiry', body: 'Pick how many days the request stays open for uploads before it automatically closes.' },
            { icon: '🔔', title: 'Notified on upload', body: "Get an email the moment they've sent something — or turn notifications off if you'd rather just check back." },
            { icon: '👥', title: 'Open link or invite-only', body: 'Share one link anyone can use, or restrict it to specific people by email.' },
            { icon: '💰', title: 'Funded by your wallet', body: "The upload is billed to your wallet, same flat ₹4.99/GB rate — nothing for the sender to pay." },
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
              { step: '01', title: 'Create a request', body: 'Give it a title, set a size cap and expiry, and choose who can upload — anyone with the link, or specific invited emails.' },
              { step: '02', title: 'Share the link', body: 'Send it by email, WhatsApp, or however you’d normally reach them — copy link, QR code, or invite by email straight from VayuTransfer.' },
              { step: '03', title: 'They upload, no account needed', body: 'They open the link and drop in their files. If your wallet balance is ever short, they see a clear "waiting on you" message instead of a silent failure.' },
              { step: '04', title: 'It lands in My Transfers', body: 'The completed upload shows up in your normal transfers list like anything you sent yourself, ready to share onward or download.' },
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
        <h2 className="text-2xl font-extrabold text-text-primary mb-3">Waiting on a file from someone?</h2>
        <p className="text-muted text-sm mb-6">Create a request in seconds — sign in to get started.</p>
        <Link href="/transfer/request" className="inline-block bg-accent text-bg font-bold px-8 py-4 rounded-xl hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20">Request files →</Link>
      </section>
    </main>
  )
}
