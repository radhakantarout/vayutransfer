import Link from 'next/link'

export default function AboutPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-16 space-y-20">

      {/* Hero */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-extrabold text-text-primary">
          Built for India. <span className="text-accent">Pay as you go.</span>
        </h1>
        <p className="text-muted text-lg max-w-2xl mx-auto leading-relaxed">
          VayuTransfer is a prepaid file transfer platform designed for the Indian market —
          no subscriptions, no surprises. Load credits, share files, pay only for what you use.
        </p>
      </div>

      {/* Mission */}
      <div className="bg-card border border-border rounded-2xl p-8 space-y-4">
        <h2 className="text-2xl font-bold text-text-primary">Our Mission</h2>
        <p className="text-muted leading-relaxed">
          File transfer tools built for Western markets charge monthly subscriptions —
          whether you transfer one file or a thousand. For most users in India, that model doesn't make sense.
        </p>
        <p className="text-muted leading-relaxed">
          VayuTransfer flips that. You load a wallet with credits and only pay when you actually
          transfer something. Storage under 500 MB is free. Larger files are priced per GB.
          You choose how many people can download — priced by file size. No idle charges. No credit card on file month after month.
        </p>
        <p className="text-muted leading-relaxed">
          We built this to be the simplest, most honest file transfer service for individuals,
          freelancers, and small teams across India.
        </p>
      </div>

      {/* How it works */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-text-primary text-center">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              step: '01',
              title: 'Load Your Wallet',
              desc: 'Sign in with Google and get ₹50 free. Top up anytime with Razorpay — UPI, cards, netbanking all supported.',
            },
            {
              step: '02',
              title: 'Upload Your File',
              desc: 'Drop a file up to 10 GB. Your wallet is debited before the upload begins — zero loss, zero surprise charges.',
            },
            {
              step: '03',
              title: 'Share the Link',
              desc: 'Get a secure expiring link. Share via WhatsApp, Gmail, or SMS. Recipients download directly — no account needed.',
            },
          ].map((item) => (
            <div key={item.step} className="bg-card border border-border rounded-2xl p-6 space-y-3">
              <div className="text-accent font-extrabold text-3xl">{item.step}</div>
              <div className="font-semibold text-text-primary text-lg">{item.title}</div>
              <p className="text-muted text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Why VayuTransfer */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-text-primary text-center">Why VayuTransfer</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { icon: '₹', title: 'No subscriptions', desc: 'Pay only when you transfer. Your balance never expires.' },
            { icon: '🔒', title: 'Secure by default', desc: 'Every link expires in 24 hours. Download count is capped and tracked atomically.' },
            { icon: '⚡', title: 'Fast uploads', desc: 'Multipart uploads directly to AWS S3 Mumbai — low latency across India.' },
            { icon: '📱', title: 'Share anywhere', desc: 'One-click share to WhatsApp, Gmail, or SMS right from the upload page.' },
            { icon: '🔁', title: 'Refund guarantee', desc: 'If your upload fails or is cancelled, your wallet is refunded immediately.' },
            { icon: '🇮🇳', title: 'India-first payments', desc: 'Powered by Razorpay. UPI, cards, netbanking — all Indian payment methods supported.' },
          ].map((item) => (
            <div key={item.title} className="flex gap-4 bg-card border border-border rounded-xl p-5">
              <div className="text-2xl flex-shrink-0">{item.icon}</div>
              <div>
                <div className="font-semibold text-text-primary text-sm">{item.title}</div>
                <div className="text-muted text-sm mt-1 leading-relaxed">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Made in India */}
      <div className="bg-accent/5 border border-accent/20 rounded-2xl p-8 text-center space-y-3">
        <div className="text-4xl">🇮🇳</div>
        <h2 className="text-xl font-bold text-text-primary">Made in India, for India</h2>
        <p className="text-muted max-w-xl mx-auto text-sm leading-relaxed">
          VayuTransfer runs on AWS ap-south-1 (Mumbai) — keeping your data within India and ensuring
          fast transfers for users across the country. Payments via Razorpay, emails via AWS SES.
          Built with Next.js and deployed on Vercel.
        </p>
      </div>

      {/* CTA */}
      <div className="text-center space-y-3">
        <Link
          href="/"
          className="inline-block bg-accent text-bg font-bold px-8 py-4 rounded-xl text-lg hover:bg-accent/90 transition-colors"
        >
          Start Transferring
        </Link>
        <p className="text-muted text-sm">New users get ₹50 free — no credit card required</p>
      </div>

    </main>
  )
}
