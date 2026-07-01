import Link from 'next/link'
import Image from 'next/image'

const FOOTER_PRODUCTS = [
  { label: 'Client Gallery',   href: '/studio/products/client-gallery'  },
  { label: 'Guest QR Code',    href: '/studio/products/guest-qr'         },
  { label: 'AI Face Search',   href: '/studio/products/ai-search'        },
  { label: 'Print Delivery',   href: '/studio/products/print-delivery'   },
  { label: 'Studio Dashboard', href: '/studio/products/dashboard'        },
  { label: 'Studio Website',   href: '/studio/products/studio-website'   },
]

const FOOTER_COMPANY = [
  { label: 'About Us',  href: '/studio/about'   },
  { label: 'Events',    href: '/studio/events'   },
  { label: 'Examples',  href: '/studio/examples' },
  { label: 'Pricing',   href: '/studio/pricing'  },
  { label: 'Login',     href: '/studio/login'    },
]

const FOOTER_SUPPORT = [
  { label: 'Help & FAQ',           href: '/studio/help'                                      },
  { label: 'WhatsApp Support',     href: 'https://wa.me/918984769522', external: true        },
  { label: 'Email Support',        href: 'mailto:support@vayutransfer.com', external: true   },
  { label: 'Privacy Policy',       href: '/privacy'                                           },
  { label: 'Terms of Service',     href: '/terms'                                             },
]

export default function StudioFooter() {
  return (
    <footer className="bg-card border-t border-border">
      {/* Main grid */}
      <div className="max-w-6xl mx-auto px-6 py-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">

        {/* Col 1 — Brand */}
        <div className="lg:col-span-1">
          <Link href="/studio/home" className="flex items-center gap-2 mb-4">
            <Image src="/logo.png" alt="VayuStudios" width={32} height={32} className="h-8 w-8" />
            <span className="text-base font-extrabold text-text-primary">
              Vayu<span className="text-accent">Studios</span>
            </span>
          </Link>
          <p className="text-muted text-sm leading-relaxed mb-5">
            Their memories. Instantly connected.<br />
            Professional photo gallery delivery built for Indian photographers.
          </p>
          {/* Social / contact */}
          <div className="flex items-center gap-3">
            <a
              href="https://wa.me/918984769522"
              target="_blank"
              rel="noopener noreferrer"
              title="WhatsApp Support"
              className="w-9 h-9 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 flex items-center justify-center text-[#25D366] hover:bg-[#25D366]/20 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 32 32" fill="currentColor">
                <path d="M16 4.5C10.201 4.5 5.5 9.201 5.5 15c0 2.21.71 4.26 1.914 5.932L5.5 27.5l6.75-1.594A11.46 11.46 0 0016 27c5.799 0 10.5-4.701 10.5-11S21.799 4.5 16 4.5zM21.5 18.385c-.288-.144-1.7-.838-1.963-.934-.263-.097-.454-.144-.646.144-.191.288-.742.934-.909 1.126-.167.191-.335.215-.623.072-.288-.144-1.216-.448-2.317-1.428-.856-.763-1.434-1.706-1.602-1.993-.167-.288-.018-.444.126-.587.129-.129.288-.335.432-.503.144-.167.191-.288.288-.48.096-.191.048-.359-.024-.503-.072-.144-.646-1.558-.885-2.133-.233-.56-.47-.484-.646-.493l-.55-.01c-.191 0-.503.072-.767.359-.263.288-1.005.982-1.005 2.396s1.029 2.779 1.173 2.971c.144.191 2.025 3.09 4.908 4.332.686.296 1.22.473 1.637.605.687.22 1.313.188 1.808.114.552-.082 1.7-.695 1.94-1.366.239-.671.239-1.247.167-1.366-.072-.12-.263-.192-.55-.336z"/>
              </svg>
            </a>
            <a
              href="mailto:support@vayutransfer.com"
              title="Email Support"
              className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-center text-accent hover:bg-accent/20 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <rect x="2" y="4" width="20" height="16" rx="3"/>
                <path strokeLinecap="round" d="M2 7l9.293 6.293a1 1 0 001.414 0L22 7"/>
              </svg>
            </a>
            <a
              href="https://vayutransfer.com"
              target="_blank"
              rel="noopener noreferrer"
              title="VayuTransfer"
              className="w-9 h-9 rounded-xl bg-border/60 border border-border flex items-center justify-center text-muted hover:text-text-primary hover:bg-border transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <circle cx="12" cy="12" r="10"/>
                <path strokeLinecap="round" d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
              </svg>
            </a>
          </div>
        </div>

        {/* Col 2 — Products */}
        <div>
          <h3 className="text-xs font-bold text-text-primary uppercase tracking-widest mb-4">Products</h3>
          <ul className="space-y-2.5">
            {FOOTER_PRODUCTS.map(({ label, href }) => (
              <li key={href}>
                <Link href={href} className="text-sm text-muted hover:text-accent transition-colors">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Col 3 — Company */}
        <div>
          <h3 className="text-xs font-bold text-text-primary uppercase tracking-widest mb-4">Company</h3>
          <ul className="space-y-2.5">
            {FOOTER_COMPANY.map(({ label, href }) => (
              <li key={href}>
                <Link href={href} className="text-sm text-muted hover:text-accent transition-colors">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Col 4 — Support */}
        <div>
          <h3 className="text-xs font-bold text-text-primary uppercase tracking-widest mb-4">Support</h3>
          <ul className="space-y-2.5">
            {FOOTER_SUPPORT.map(({ label, href, external }) => (
              <li key={href}>
                <a
                  href={href}
                  {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="text-sm text-muted hover:text-accent transition-colors"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
          {/* Reach us */}
          <div className="mt-6 bg-bg border border-border rounded-xl p-3 space-y-1">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Reach us</p>
            <p className="text-xs text-text-primary font-medium">support@vayutransfer.com</p>
            <p className="text-xs text-muted">Mon – Sat, 9 AM – 7 PM IST</p>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted">
          <span>© {new Date().getFullYear()} VayuStudios by VayuTransfer · Their memories. Instantly connected.</span>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-accent transition-colors">Privacy</Link>
            <Link href="/terms"   className="hover:text-accent transition-colors">Terms</Link>
            <a href="https://vayutransfer.com" target="_blank" rel="noopener noreferrer" className="hover:text-accent transition-colors">vayutransfer.com →</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
