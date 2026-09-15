import type { Metadata } from 'next'
import Image from 'next/image'
import ChooserCard from '@/components/studio/ChooserCard'

const GRADIENT = 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)'

export const metadata: Metadata = {
  title: 'VayuStudios — Share moments or run your photography studio',
  description: 'Free private galleries for your own events, or a full gallery-delivery toolkit for professional photographers. Choose your path.',
}

// The very first thing a first-time, cookie-less visitor to vayustudios.com
// sees (rewritten here by middleware.ts's root-path branch) — a returning
// visitor, or anyone already signed in as a Moments user, skips straight
// past this to their actual destination. Server Component (only the two
// ChooserCards are client-side) so the root domain still has real,
// indexable content rather than a client-only shell.
export default function VayuStudiosWelcomePage() {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="flex items-center justify-center px-5 py-6">
        <div className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="VayuStudios" width={28} height={28} className="h-7 w-7" />
          <span className="text-sm font-extrabold text-text-primary">VayuStudios</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-5 py-8 sm:py-12">
        <div className="w-full max-w-3xl space-y-8 sm:space-y-10">
          <div className="text-center space-y-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary">What brings you here today?</h1>
            <p className="text-sm sm:text-base text-muted">Pick a path — you can always switch later.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            <ChooserCard href="/studio/moments" value="moments" className="animate-reel-pop-in" style={{ animationFillMode: 'backwards' }}>
              <div className="moments-dark rounded-3xl p-6 sm:p-7 h-full border border-border bg-card hover:-translate-y-1 transition-transform duration-200 shadow-lg space-y-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl animate-reel-float" style={{ background: GRADIENT }}>
                  ✨
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-lg font-extrabold text-text-primary">Share moments from an event</h2>
                  <p className="text-sm text-muted leading-relaxed">
                    Free private galleries for weddings, trips, and get-togethers — invite your people, no studio needed.
                  </p>
                </div>
                <p className="text-sm font-bold text-white inline-flex items-center gap-1 rounded-full px-4 py-2" style={{ background: GRADIENT }}>
                  Let&apos;s go <span aria-hidden>→</span>
                </p>
              </div>
            </ChooserCard>

            <ChooserCard href="/studio/home" value="studio" className="animate-reel-pop-in" style={{ animationDelay: '80ms', animationFillMode: 'backwards' }}>
              <div className="rounded-3xl p-6 sm:p-7 h-full border border-border bg-card hover:-translate-y-1 transition-transform duration-200 shadow-lg space-y-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl bg-nav/10">
                  📷
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-lg font-extrabold text-text-primary">I&apos;m a professional photographer</h2>
                  <p className="text-sm text-muted leading-relaxed">
                    Deliver full wedding &amp; event galleries to clients, manage selections, and get paid.
                  </p>
                </div>
                <p className="text-sm font-bold text-accent inline-flex items-center gap-1 rounded-full px-4 py-2 border border-accent/30">
                  Enter Studio <span aria-hidden>→</span>
                </p>
              </div>
            </ChooserCard>
          </div>

          <p className="text-center text-[11px] text-muted">You can always switch later.</p>
        </div>
      </main>
    </div>
  )
}
