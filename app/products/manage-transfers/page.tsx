import type { Metadata } from 'next'
import Link from 'next/link'
import { FolderIcon } from '@/components/icons'
import { MAX_EXPIRY_DAYS_FROM_UPLOAD } from '@/constants/pricing'

export const metadata: Metadata = {
  title: 'Manage Transfers — VayuTransfer',
  description: 'Search, filter, extend expiry, and track every download across every link you\'ve ever sent or received — all in one dashboard.',
}

export default function ManageTransfersProductPage() {
  return (
    <main className="min-h-screen bg-bg">
      {/* Hero */}
      <section className="bg-card border-b border-border py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-6">
            <FolderIcon className="w-7 h-7 text-accent" />
          </div>
          <span className="inline-block text-accent text-xs font-bold uppercase tracking-widest mb-3 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">Product</span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-text-primary mt-3 mb-4">Manage Transfers</h1>
          <p className="text-text-primary/80 text-lg max-w-2xl mx-auto leading-relaxed">
            Every link you've ever sent or requested, in one place — search it, filter it, see exactly who downloaded
            what and when, and extend a link's life before it expires.
          </p>
          <div className="flex items-center justify-center gap-4 mt-8 flex-wrap">
            <Link href="/transfers" className="bg-accent text-bg font-bold px-8 py-3.5 rounded-xl hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20">Open My Transfers</Link>
            <Link href="/pricing" className="text-accent font-medium hover:underline">See pricing →</Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { icon: '🔍', title: 'Search & filter', body: 'Find any transfer by title or recipient email, filter by active/expired/failed/uploading, and sort by newest, oldest, or largest.' },
            { icon: '📊', title: 'Stats at a glance', body: 'Total transfers, total size, total downloads, and how many links are still active — right at the top of the page.' },
            { icon: '🕒', title: 'Per-download activity log', body: 'Open any transfer to see every download attempt against it — when, from where, and whether it succeeded or was blocked.' },
            { icon: '⏰', title: 'Extend or revive expiry', body: `Push a link's life out to up to ${MAX_EXPIRY_DAYS_FROM_UPLOAD} days from upload — even after it's already expired.` },
            { icon: '🔗', title: 'Copy, share, or QR code', body: 'Grab the link, open the built-in share panel, or generate a QR code for any active transfer, right from the list.' },
            { icon: '🗑️', title: 'Trash, not gone forever', body: 'Deleted transfers move to a Trash tab so you can still see what a link used to be, even after removal.' },
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
              { step: '01', title: 'Open My Transfers', body: 'Every link you\'ve sent, and every request you\'ve created, lands here automatically — nothing to set up.' },
              { step: '02', title: 'Find what you need', body: 'Search by name or email, filter by status, or sort by size — useful the moment you have more than a handful of transfers.' },
              { step: '03', title: 'Act on any transfer', body: 'Copy the link, share it again, check who\'s downloaded it, or extend its expiry — all from the same row.' },
              { step: '04', title: 'Nothing falls through the cracks', body: 'Expired links stay visible with a clear status badge, and you can revive one back to life whenever you need to.' },
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
        <h2 className="text-2xl font-extrabold text-text-primary mb-3">See everything in one place</h2>
        <p className="text-muted text-sm mb-6">Sign in to view your transfers dashboard.</p>
        <Link href="/transfers" className="inline-block bg-accent text-bg font-bold px-8 py-4 rounded-xl hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20">Open My Transfers →</Link>
      </section>
    </main>
  )
}
