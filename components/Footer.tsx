import Link from 'next/link'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-border bg-card/50 mt-20">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div className="col-span-2 md:col-span-1">
            <span className="font-extrabold text-accent text-lg">VayuTransfer</span>
            <p className="text-muted text-sm mt-2 leading-relaxed">
              Secure file transfers across the globe. Pay only for what you use. Zero hidden fees.
            </p>
          </div>
          <div>
            <h4 className="text-text-primary text-sm font-semibold mb-3">Product</h4>
            <ul className="space-y-2 text-sm text-muted">
              <li><Link href="/" className="hover:text-text-primary transition-colors">Transfer Files</Link></li>
              <li><Link href="/pricing" className="hover:text-text-primary transition-colors">Pricing</Link></li>
              <li><Link href="/transfers" className="hover:text-text-primary transition-colors">My Transfers</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-text-primary text-sm font-semibold mb-3">Company</h4>
            <ul className="space-y-2 text-sm text-muted">
              <li><Link href="/about" className="hover:text-text-primary transition-colors">About</Link></li>
              <li><Link href="/support" className="hover:text-text-primary transition-colors">Support</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-text-primary text-sm font-semibold mb-3">Legal</h4>
            <ul className="space-y-2 text-sm text-muted">
              <li><Link href="/terms" className="hover:text-text-primary transition-colors">Terms of Service</Link></li>
              <li><Link href="/privacy" className="hover:text-text-primary transition-colors">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted">
          <span>&copy; {year} VayuTransfer. All rights reserved.</span>
          <span>Made in India 🇮🇳 · Hosted on AWS Mumbai Region</span>
        </div>
      </div>
    </footer>
  )
}
