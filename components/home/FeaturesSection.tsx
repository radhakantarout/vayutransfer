import { PackageIcon, InboxIcon, RefreshIcon, EyeIcon, ListIcon, WalletIcon } from '@/components/icons'

const FEATURES = [
  { icon: PackageIcon, title: 'Batch & folder uploads', body: 'Send a whole folder or a stack of files in one link — nothing gets zipped, and the folder structure stays exactly as it was.' },
  { icon: InboxIcon, title: 'Receive links', body: 'Request a file from someone else. They upload straight to you through a link — no account needed on their end.' },
  { icon: RefreshIcon, title: 'Auto-resume uploads', body: 'Connection drops mid-upload? It picks up exactly where it left off — nothing restarts from zero.' },
  { icon: EyeIcon, title: 'Live file preview', body: 'See images, video, audio, PDFs, text, and Word documents before you even click upload.' },
  { icon: ListIcon, title: 'My Transfers', body: 'Every link you’ve sent — status, downloads, days left — tracked in one place you can check anytime.' },
  { icon: WalletIcon, title: '₹50 free credit to start', body: 'No credit card required. After that it’s one flat rate, ₹4.99/GB — no plans to compare, no upsells.' },
]

export default function FeaturesSection() {
  return (
    <section className="py-20 md:py-24">
      <div className="max-w-xl mb-14 animate-fade-up">
        <div className="font-mono text-xs uppercase tracking-widest text-accent/80 mb-3">What&apos;s built in</div>
        <h2 className="font-display text-3xl md:text-[2.5rem] font-bold leading-tight text-text-primary text-balance">
          Everything a transfer needs. Nothing it doesn&apos;t.
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {FEATURES.map(({ icon: Icon, title, body }, i) => (
          <div
            key={title}
            className="group rounded-2xl p-6 bg-card border border-border hover:border-accent/40 hover:shadow-lg transition-all duration-200"
          >
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 border ${
              i % 2 === 0 ? 'bg-accent/10 border-accent/25 text-accent' : 'bg-success/10 border-success/25 text-success'
            }`}>
              <Icon className="w-5 h-5" />
            </div>
            <h4 className="font-display text-base font-semibold text-text-primary mb-1.5">{title}</h4>
            <p className="text-sm text-muted leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
