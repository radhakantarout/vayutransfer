import Image from 'next/image'
import { WalletIcon, PackageIcon, DownloadIcon } from '@/components/icons'

const PITCHES = [
  { icon: WalletIcon, text: 'Flat ₹4.99/GB. No subscriptions, no surprises.' },
  { icon: PackageIcon, text: 'Send up to 400GB in one go, secured end to end.' },
  { icon: DownloadIcon, text: 'Unlimited downloads until your link expires.' },
]

export default function AuthMarketingPanel({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-8 flex flex-col justify-between min-h-[420px]">
      <div
        className="absolute w-64 h-64 rounded-full pointer-events-none -right-20 -top-20"
        style={{ background: 'radial-gradient(circle, rgb(var(--accent) / 0.16), transparent 70%)' }}
        aria-hidden
      />
      <div className="relative z-10">
        <Image src="/logo.png" alt="VayuTransfer" width={40} height={40} className="rounded-xl shadow-sm mb-6" />
        <h1 className="font-display font-extrabold text-3xl leading-tight text-text-primary text-balance">{title}</h1>
        <p className="mt-3 text-[15px] text-text-primary/80 leading-relaxed max-w-sm">{subtitle}</p>
      </div>

      <div className="relative z-10 space-y-3 mt-8">
        {PITCHES.map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-3 bg-bg border border-border rounded-xl px-4 py-3">
            <span className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4" />
            </span>
            <span className="text-sm text-text-primary font-medium">{text}</span>
          </div>
        ))}
      </div>

      <div className="relative z-10 mt-8 flex items-center gap-2">
        <span className="font-mono text-[11px] text-accent border border-accent/25 bg-accent/[0.06] px-3 py-1.5 rounded-full">
          ₹50 free credit the moment you sign up
        </span>
      </div>
    </div>
  )
}
