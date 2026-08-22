import Link from 'next/link'
import { SendIcon, InboxIcon, FolderIcon, ArrowRightIcon } from '@/components/icons'

const PRODUCTS = [
  {
    icon: SendIcon,
    title: 'Transfer Files',
    href: '/products/transfer-files',
    body: 'Send a file or a whole folder, up to 400GB, at a flat ₹4.99/GB.',
    steps: ['Drop in your files', 'Wallet charged once, upfront', 'Share the link — downloads are free'],
  },
  {
    icon: InboxIcon,
    title: 'Receive Files',
    href: '/products/receive-files',
    body: 'Request files from anyone — they upload with no account of their own.',
    steps: ['Create a request link', 'Send it to anyone', 'It lands in My Transfers'],
  },
  {
    icon: FolderIcon,
    title: 'Manage Transfers',
    href: '/products/manage-transfers',
    body: 'Every link you\'ve sent or requested — searchable, trackable, extendable.',
    steps: ['Search & filter your links', 'See per-download activity', 'Extend expiry anytime'],
  },
]

export default function ProductsOverviewSection() {
  return (
    <section className="py-20 md:py-24">
      <div className="max-w-xl mb-14 animate-fade-up">
        <div className="font-mono text-xs uppercase tracking-widest text-accent/80 mb-3">Explore VayuTransfer</div>
        <h2 className="font-display text-3xl md:text-[2.5rem] font-bold leading-tight text-text-primary text-balance">
          Three ways to move a file.
        </h2>
        <p className="mt-3.5 text-muted text-base leading-relaxed">
          Send files out, ask for files back, or keep track of everything already in motion — each one gets its own dedicated page.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {PRODUCTS.map(({ icon: Icon, title, href, body, steps }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col rounded-2xl p-6 bg-card border border-border hover:border-accent/40 hover:shadow-lg transition-all duration-200"
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 border bg-accent/10 border-accent/25 text-accent">
              <Icon className="w-5 h-5" />
            </div>
            <h3 className="font-display text-lg font-semibold text-text-primary mb-1.5">{title}</h3>
            <p className="text-sm text-muted leading-relaxed mb-4">{body}</p>

            <ol className="space-y-1.5 mb-5">
              {steps.map((step, i) => (
                <li key={step} className="flex items-center gap-2 text-xs text-muted">
                  <span className="w-4 h-4 rounded-full bg-bg border border-border flex items-center justify-center text-[10px] font-semibold text-accent flex-shrink-0">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>

            <span className="mt-auto flex items-center gap-1.5 text-sm font-semibold text-accent group-hover:gap-2.5 transition-all">
              Learn more
              <ArrowRightIcon className="w-3.5 h-3.5" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
