import Link from 'next/link'

export default function PricingPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold text-text-primary">Simple, Transparent Pricing</h1>
        <p className="text-muted mt-3 text-lg">Pay only for what you use. No subscriptions. No hidden fees.</p>
      </div>

      {/* Pricing slabs */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden mb-10">
        <div className="px-6 py-4 border-b border-border bg-bg/50">
          <h2 className="font-bold text-text-primary">Storage — Pay Per Transfer</h2>
        </div>
        <div className="divide-y divide-border">
          {[
            { range: 'Under 500 MB', rate: 'Free', note: '' },
            { range: '500 MB – 2 GB', rate: '₹5 / GB', note: '' },
            { range: '2 GB – 5 GB', rate: '₹4 / GB', note: 'Volume discount' },
            { range: '5 GB – 10 GB', rate: '₹3 / GB', note: 'Best rate' },
          ].map((row) => (
            <div key={row.range} className="flex items-center justify-between px-6 py-4">
              <span className="text-text-primary text-sm">{row.range}</span>
              <div className="text-right">
                <span className="font-bold text-accent">{row.rate}</span>
                {row.note && <div className="text-xs text-muted">{row.note}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Download slots */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden mb-10">
        <div className="px-6 py-4 border-b border-border bg-bg/50">
          <h2 className="font-bold text-text-primary">Max Downloads — Priced by File Size</h2>
          <p className="text-xs text-muted mt-1">Choose how many people can download your file</p>
        </div>
        <div className="divide-y divide-border">
          {[
            { range: 'Under 500 MB',  slot: 'Free', free: true },
            { range: '500 MB – 2 GB', slot: '₹14',  free: false },
            { range: '2 GB – 5 GB',   slot: '₹47',  free: false },
            { range: '5 GB – 10 GB',  slot: '₹101', free: false },
          ].map((row) => (
            <div key={row.range} className="flex items-center justify-between px-6 py-4 text-sm">
              <span className="text-text-primary">{row.range}</span>
              {row.free
                ? <span className="font-bold text-success">Free</span>
                : <span className="font-bold text-accent">{row.slot} / slot</span>
              }
            </div>
          ))}
        </div>
      </div>

      {/* Example */}
      <div className="bg-accent/5 border border-accent/20 rounded-2xl p-6 mb-10">
        <h3 className="font-bold text-text-primary mb-4">Example: 1 GB file, 3 downloads</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted">Storage (1 GB at ₹5/GB)</span><span className="text-text-primary">₹5.00</span></div>
          <div className="flex justify-between"><span className="text-muted">3 downloads allowed (3 × ₹14 — 500MB–2GB tier)</span><span className="text-text-primary">₹42.00</span></div>
          <div className="border-t border-border pt-2 flex justify-between font-bold"><span className="text-text-primary">Total</span><span className="text-accent">₹47.00</span></div>
        </div>
      </div>

      {/* Wallet top-up */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden mb-10">
        <div className="px-6 py-4 border-b border-border bg-bg/50">
          <h2 className="font-bold text-text-primary">Wallet Top-Up Packs</h2>
        </div>
        <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
          {[
            { label: 'Starter', price: '₹199', value: '₹199', bonus: null },
            { label: 'Popular', price: '₹499', value: '₹549', bonus: '+₹50 bonus', hot: true },
            { label: 'Pro', price: '₹999', value: '₹1,149', bonus: '+₹150 bonus' },
            { label: 'Agency', price: '₹2,999', value: '₹3,599', bonus: '+₹600 bonus' },
          ].map((tier) => (
            <div key={tier.label} className={`px-6 py-5 relative ${tier.hot ? 'bg-accent/5' : ''}`}>
              {tier.hot && (
                <span className="absolute top-3 right-4 text-xs bg-accent text-bg font-bold px-2 py-0.5 rounded-full">Popular</span>
              )}
              <div className="font-semibold text-text-primary">{tier.label}</div>
              <div className="text-2xl font-extrabold text-text-primary mt-1">{tier.price}</div>
              <div className="text-xs text-muted mt-1">Get {tier.value} wallet value{tier.bonus ? ` (${tier.bonus})` : ''}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="text-center">
        <Link
          href="/"
          className="inline-block bg-accent text-bg font-bold px-8 py-4 rounded-xl text-lg hover:bg-accent/90 transition-colors"
        >
          Start Transferring
        </Link>
        <p className="text-muted text-sm mt-3">New users get ₹50 free — no credit card required</p>
      </div>
    </main>
  )
}
