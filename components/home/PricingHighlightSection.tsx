import Link from 'next/link'
import { CheckCircleIcon, WalletIcon } from '@/components/icons'
import { formatPaise } from '@/lib/pricing'

interface Props {
  balancePaise?: number | null
  freeQuotaRemainingBytes?: number | null
}

const POINTS = [
  <>The first <b className="text-text-primary font-semibold">10GB every month</b> is free, no card required.</>,
  <><b className="text-text-primary font-semibold">Downloading and sharing</b> are unlimited and free, always.</>,
  <><b className="text-text-primary font-semibold">No subscriptions</b> — top up your wallet, we deduct only as you use it.</>,
  <>Built for India — <b className="text-text-primary font-semibold">INR pricing</b>, no surprises.</>,
]

function formatGB(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024)
  return gb < 1 ? `${Math.round(gb * 1024)} MB` : `${gb.toFixed(1)} GB`
}

export default function PricingHighlightSection({ balancePaise, freeQuotaRemainingBytes }: Props) {
  return (
    <section className="py-20 md:py-24" id="pricing-highlight">
      <div className="max-w-xl mb-14 animate-fade-up">
        <div className="font-mono text-xs uppercase tracking-widest text-accent/80 mb-3">Pricing</div>
        <h2 className="font-display text-3xl md:text-[2.5rem] font-bold leading-tight text-text-primary text-balance">
          Pay as you transfer. That&apos;s it.
        </h2>
      </div>

      <div className="grid md:grid-cols-2 rounded-3xl overflow-hidden border border-border bg-card">
        <div className="p-9 md:p-11 border-b md:border-b-0 md:border-r border-border">
          <div className="flex items-baseline gap-2.5 font-mono font-semibold text-4xl md:text-5xl tracking-tight text-text-primary">
            ₹4.99
            <span className="text-base font-sans font-normal text-muted">/ GB after your free quota</span>
          </div>
          <h3 className="font-display text-lg font-semibold text-text-primary mt-6 mb-3">One rate. No plans to pick.</h3>
          <p className="text-sm text-muted leading-relaxed">
            There&apos;s no tier to upgrade into and nothing that expires unused — just a monthly free allowance, then a flat per-GB rate on the way in.
          </p>
          <ul className="mt-6 flex flex-col gap-3">
            {POINTS.map((point, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-muted">
                <CheckCircleIcon className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-9 md:p-11 flex flex-col justify-center">
          <div className="rounded-2xl border border-border bg-bg p-6 mb-6">
            <div className="flex items-center justify-between text-xs font-mono text-muted">
              <span className="flex items-center gap-1.5"><WalletIcon className="w-3.5 h-3.5" /> WALLET BALANCE</span>
              <span>INR</span>
            </div>
            <div className="font-mono text-3xl font-semibold mt-2.5 text-accent">
              {typeof balancePaise === 'number' ? formatPaise(balancePaise) : '₹0.00'}
            </div>
            <div className="text-xs text-muted mt-3">
              {typeof freeQuotaRemainingBytes === 'number'
                ? `${formatGB(freeQuotaRemainingBytes)} of your free quota left this month`
                : 'Sign in to see your free quota and balance'}
            </div>
          </div>
          <Link
            href="/pricing"
            className="flex items-center justify-center gap-2 bg-text-primary text-bg font-bold text-[15px] py-4 rounded-2xl hover:opacity-90 transition-opacity"
          >
            See full pricing details
          </Link>
          <p className="text-center text-xs text-muted mt-3">Deducted only as you upload — nothing charged upfront.</p>
        </div>
      </div>
    </section>
  )
}
