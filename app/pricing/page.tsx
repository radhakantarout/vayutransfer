import Link from 'next/link'

export default function PricingPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold text-text-primary">Simple, Honest Pricing</h1>
        <p className="text-muted mt-3 text-lg">One flat rate, calculated to the exact size of what you send. No tiers, no monthly limits.</p>
      </div>

      {/* Flat rate */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6 text-center">
        <div className="text-sm text-muted mb-1">Every transfer, any size</div>
        <div className="text-3xl font-extrabold text-accent">₹4.99 <span className="text-lg font-semibold text-text-primary">per GB</span></div>
        <p className="text-muted mt-2 text-sm max-w-lg mx-auto">
          That's it — one price, calculated precisely for the exact size you send (send 100MB, pay for 100MB).
          However many people download your file, however many times, right up until your link expires. No extra charges, ever.
        </p>
      </div>

      {/* Free credit */}
      <div className="bg-success/5 border border-success/30 rounded-2xl p-6 mb-10 text-center">
        <div className="text-3xl font-extrabold text-success">₹50 free credit for new accounts</div>
        <p className="text-muted mt-2 text-sm max-w-lg mx-auto">
          Sign in with Google and start with ₹50 in your wallet — enough for your first real transfers. No card, no catch, never expires.
        </p>
      </div>

      {/* How it works */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden mb-10">
        <div className="px-6 py-4 border-b border-border bg-bg/50">
          <h2 className="font-bold text-text-primary">How it works</h2>
        </div>
        <div className="divide-y divide-border">
          {[
            { title: 'Recharge your wallet', desc: 'Add money once, use it whenever you send files.' },
            { title: 'Upload & share', desc: 'We calculate the exact price for your file size before you upload — no surprises after.' },
            { title: 'They download, free', desc: 'Anyone with the link can download as many times as they need.' },
          ].map((row, i) => (
            <div key={row.title} className="flex items-start gap-4 px-6 py-4">
              <div className="w-7 h-7 rounded-full bg-accent/10 text-accent font-bold text-sm flex items-center justify-center flex-shrink-0">
                {i + 1}
              </div>
              <div>
                <div className="font-semibold text-text-primary text-sm">{row.title}</div>
                <div className="text-muted text-sm">{row.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Example */}
      <div className="bg-accent/5 border border-accent/20 rounded-2xl p-6 mb-10">
        <h3 className="font-bold text-text-primary mb-4">Example</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">100 MB design files</span>
            <span className="font-semibold text-text-primary">₹0.50</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">2 GB wedding video</span>
            <span className="font-semibold text-text-primary">₹9.98</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">5 GB project files</span>
            <span className="font-semibold text-text-primary">₹24.95</span>
          </div>
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
