'use client'

import { useSession, signIn } from 'next-auth/react'
import { useWallet } from '@/lib/wallet-context'
import TransferFlow from '@/components/TransferFlow'
import WindAnimation from '@/components/home/WindAnimation'
import HowItWorksSection from '@/components/home/HowItWorksSection'
import ProductsOverviewSection from '@/components/home/ProductsOverviewSection'
import FeaturesSection from '@/components/home/FeaturesSection'
import PricingHighlightSection from '@/components/home/PricingHighlightSection'
import StudiosBandSection from '@/components/home/StudiosBandSection'
import { ArrowRightIcon } from '@/components/icons'
import { MAX_FILE_SIZE_GB } from '@/constants/pricing'

const STUDIO_URL = process.env.NEXT_PUBLIC_STUDIO_URL ?? `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/studio/home`

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

export default function HomePage() {
  const { data: session } = useSession()
  const { walletId, balancePaise } = useWallet()

  return (
    <div className="min-h-screen bg-bg w-full overflow-x-hidden">

      {process.env.NODE_ENV !== 'production' && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/30 px-4 py-2 text-center text-sm text-yellow-400 flex items-center justify-center gap-3">
          <span>DEV MODE — Razorpay bypassed</span>
          {walletId && (
            <button
              onClick={async () => {
                await fetch('/api/dev/seed', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ walletId }),
                })
                window.location.reload()
              }}
              className="bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/40 px-3 py-0.5 rounded text-xs font-semibold transition-colors"
            >
              + Add ₹500 test credits
            </button>
          )}
        </div>
      )}

      <main className="mx-auto px-4 sm:px-6 w-full max-w-5xl py-10 sm:py-16">
        <TransferFlow
          variant="embedded"
          renderIdle={(dropzone) => (
            <>
              {/* ── Hero ── */}
              <div className="text-center max-w-2xl mx-auto mb-10 animate-fade-up">
                <span className="inline-flex items-center gap-2 font-mono text-xs text-accent border border-accent/25 bg-accent/[0.06] px-3.5 py-1.5 rounded-full mb-6">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgb(var(--accent))]" />
                  Made for India · pay in INR
                </span>
                <h1 className="font-display font-extrabold text-[clamp(2.2rem,6vw,3.75rem)] leading-[1.04] tracking-tight text-text-primary text-balance">
                  Send it like{' '}
                  <span className="bg-gradient-to-r from-accent to-accent/50 bg-clip-text text-transparent">
                    the wind.
                  </span>
                </h1>
                <p className="mt-5 text-[17px] text-muted leading-relaxed max-w-lg mx-auto">
                  {session
                    ? `Welcome back, ${session.user?.name?.split(' ')[0]}! Drop in a file or a whole folder — your wallet is ready.`
                    : `Upload once and VayuTransfer carries it anywhere — up to ${MAX_FILE_SIZE_GB}GB, even on shaky networks — while downloads and sharing stay unlimited and free.`}
                </p>

                <div className="flex items-center justify-center gap-8 sm:gap-10 mt-8 flex-wrap">
                  <div>
                    <div className="font-mono text-xl font-semibold text-text-primary">₹4.99</div>
                    <div className="text-xs text-muted mt-0.5">per GB, that&apos;s it</div>
                  </div>
                  <div>
                    <div className="font-mono text-xl font-semibold text-text-primary">₹50</div>
                    <div className="text-xs text-muted mt-0.5">free credit to start</div>
                  </div>
                  <div>
                    <div className="font-mono text-xl font-semibold text-text-primary">Unlimited</div>
                    <div className="text-xs text-muted mt-0.5">downloads &amp; sharing</div>
                  </div>
                </div>
              </div>

              <WindAnimation />

              {/* ── Dropzone + side card ── */}
              <div className="grid grid-cols-1 md:grid-cols-[1.35fr_1fr] gap-5 items-stretch animate-fade-up-delay">
                {dropzone}

                <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 flex flex-col justify-between">
                  <div
                    className="absolute w-52 h-52 rounded-full pointer-events-none -right-16 -top-16"
                    style={{ background: 'radial-gradient(circle, rgb(var(--accent) / 0.14), transparent 70%)' }}
                  />
                  <div className="relative z-10">
                    {session ? (
                      <>
                        <span className="font-mono text-[11px] text-accent border border-accent/25 bg-accent/[0.06] px-2.5 py-1 rounded-full">
                          Signed in as {session.user?.name?.split(' ')[0]}
                        </span>
                        <h4 className="font-display text-lg font-semibold text-text-primary mt-4">
                          ₹{(balancePaise / 100).toFixed(2)} in your wallet
                        </h4>
                        <p className="text-[13.5px] text-muted mt-2 leading-relaxed">
                          Flat ₹4.99/GB, deducted only when you upload. No monthly limits, no separate download charges.
                        </p>
                      </>
                    ) : (
                      <>
                        <span className="font-mono text-[11px] text-accent border border-accent/25 bg-accent/[0.06] px-2.5 py-1 rounded-full">
                          Sign in with Google
                        </span>
                        <h4 className="font-display text-lg font-semibold text-text-primary mt-4">Get ₹50 free credit</h4>
                        <p className="text-[13.5px] text-muted mt-2 leading-relaxed">
                          Enough for real transfers to start. Or skip sign-in and transfer anonymously — your call.
                        </p>
                        <button
                          onClick={() => signIn('google')}
                          className="flex items-center gap-2 bg-text-primary text-bg font-semibold text-sm px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity mt-4"
                        >
                          <GoogleGlyph />
                          Sign in with Google
                        </button>
                      </>
                    )}
                  </div>

                  <a
                    href={STUDIO_URL}
                    className="relative z-10 mt-6 flex items-center justify-between px-4 py-3.5 rounded-xl bg-bg border border-border hover:border-accent/40 group transition-colors"
                  >
                    <span className="text-[13px] font-semibold text-text-primary group-hover:text-accent transition-colors">
                      VayuStudios — for photographers &amp; videographers
                    </span>
                    <ArrowRightIcon className="w-4 h-4 text-muted group-hover:text-accent group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                  </a>
                </div>
              </div>

              <HowItWorksSection />
              <ProductsOverviewSection />
              <FeaturesSection />
              <PricingHighlightSection
                balancePaise={session ? balancePaise : undefined}
              />
              <StudiosBandSection />
            </>
          )}
        />
      </main>
    </div>
  )
}
