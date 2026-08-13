'use client'

import { useState, useEffect } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useWallet } from '@/lib/wallet-context'
import { useUpload } from '@/lib/upload-context'
import UploadZone from '@/components/UploadZone'
import PriceCalculator from '@/components/PriceCalculator'
import FilePreviewPanel from '@/components/FilePreviewPanel'
import UploadProgress from '@/components/UploadProgress'
import EmailTagInput from '@/components/EmailTagInput'
import WindAnimation from '@/components/home/WindAnimation'
import HowItWorksSection from '@/components/home/HowItWorksSection'
import FeaturesSection from '@/components/home/FeaturesSection'
import PricingHighlightSection from '@/components/home/PricingHighlightSection'
import StudiosBandSection from '@/components/home/StudiosBandSection'
import { LockIcon, FolderIcon, ArrowRightIcon } from '@/components/icons'
import { EXPIRY_DAY_OPTIONS, DEFAULT_EXPIRY_DAYS, MAX_FILE_SIZE_GB, MAX_EXPIRY_DAYS_FROM_UPLOAD } from '@/constants/pricing'
import type { PriceBreakdown, FileEntry } from '@/types'

type PageState = 'idle' | 'pricing' | 'uploading'

const MAX_TOTAL_BYTES = MAX_FILE_SIZE_GB * 1024 * 1024 * 1024
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
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [pricing, setPricing] = useState<PriceBreakdown | null>(null)
  const [pageState, setPageState] = useState<PageState>('idle')
  const [recipientEmails, setRecipientEmails] = useState<string[]>([])
  const [expiryDays, setExpiryDays] = useState<number>(DEFAULT_EXPIRY_DAYS)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentUploadId, setCurrentUploadId] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  const { data: session } = useSession()
  const { walletId, balancePaise, refreshBalance } = useWallet()
  const { uploads, startUpload, startBatchUpload, abortUpload, minimizeUpload } = useUpload()

  const currentUpload = uploads.find(u => u.id === currentUploadId) ?? null

  // Refresh balance once upload completes
  useEffect(() => {
    if (currentUpload?.status === 'done') {
      refreshBalance()
    }
  }, [currentUpload?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // Safety: if the tracked upload was dismissed from the widget while page is still in uploading state, reset to idle
  useEffect(() => {
    if (currentUploadId && !currentUpload) {
      setCurrentUploadId(null)
      setPageState('idle')
      setEntries([])
      setPricing(null)
      setRecipientEmails([])
      setAgreedToTerms(false)
    }
  }, [currentUploadId, currentUpload])

  const totalSizeBytes = entries.reduce((s, e) => s + e.file.size, 0)
  const isBundle = entries.length > 1

  const handleFilesSelect = (newEntries: FileEntry[]) => {
    setEntries(newEntries)
    setError(null)
    if (newEntries.length === 0) {
      setPageState('idle')
      setPricing(null)
      setSelectedPath(null)
    } else {
      setPageState('pricing')
      if (!newEntries.some((e) => e.path === selectedPath)) setSelectedPath(newEntries[0].path)
    }
  }

  const handleUpload = () => {
    if (!entries.length || !pricing || !walletId) return
    setError(null)

    const id = entries.length === 1
      ? startUpload(entries[0].file, pricing, walletId, recipientEmails, expiryDays)
      : startBatchUpload(entries, pricing, walletId, recipientEmails, expiryDays)

    setCurrentUploadId(id)
    setPageState('uploading')
    // upload-context now owns whatever File references it needs (via its own
    // retry-args refs) — nothing in the 'uploading' screen reads `entries`,
    // so holding onto every selected File here for the rest of this page's
    // lifetime (including the whole time a "upload complete" screen might be
    // left open) is pure leaked memory on a large folder selection.
    setEntries([])
  }

  const handleAbort = async () => {
    if (!currentUploadId) return
    await abortUpload(currentUploadId)
    setCurrentUploadId(null)
    setPageState('idle')
    setEntries([])
    setPricing(null)
    setRecipientEmails([])
    setAgreedToTerms(false)
    setSelectedPath(null)
  }

  const handleMinimize = () => {
    if (currentUploadId) minimizeUpload(currentUploadId)
    setCurrentUploadId(null)
    setPageState('idle')
    setEntries([])
    setPricing(null)
    setRecipientEmails([])
    setAgreedToTerms(false)
    setSelectedPath(null)
  }

  const canUpload =
    pricing &&
    walletId &&
    balancePaise >= pricing.totalPaise &&
    agreedToTerms &&
    totalSizeBytes <= MAX_TOTAL_BYTES

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

      <main className={`mx-auto px-4 sm:px-6 w-full transition-all duration-300 ${
        pageState === 'idle' ? 'max-w-5xl py-10 sm:py-16' : pageState === 'pricing' ? 'max-w-4xl py-8 sm:py-10' : 'max-w-xl py-8 sm:py-10'
      }`}>

        {pageState === 'idle' && (
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
              <UploadZone onFilesSelect={handleFilesSelect} enableDuplicateCheck />

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
            <FeaturesSection />
            <PricingHighlightSection
              balancePaise={session ? balancePaise : undefined}
            />
            <StudiosBandSection />
          </>
        )}

        {pageState === 'pricing' && entries.length > 0 && !session && (
          <div className="space-y-4">
            <UploadZone onFilesSelect={handleFilesSelect} entries={entries} enableDuplicateCheck />
            <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center gap-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
                <LockIcon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-text-primary font-semibold text-lg">Sign in to upload</p>
                <p className="text-muted text-sm mt-1">Get ₹50 free credit instantly</p>
              </div>
              <button
                onClick={() => signIn('google')}
                className="flex items-center gap-2 bg-white text-gray-800 font-semibold px-6 py-3 rounded-xl hover:bg-gray-100 transition-colors shadow-sm"
              >
                <GoogleGlyph />
                Sign in with Google
              </button>
              <p className="text-xs text-muted">No hidden charges &nbsp;·&nbsp; No credit card required</p>
            </div>
          </div>
        )}

        {pageState === 'pricing' && entries.length > 0 && session && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div className="space-y-4">
              <UploadZone
                onFilesSelect={handleFilesSelect}
                entries={entries}
                selectedPath={selectedPath}
                onSelectPath={setSelectedPath}
                enableDuplicateCheck
              />

              {isBundle && (
                <div className="flex items-center gap-2 text-xs text-muted bg-card border border-border rounded-lg px-3 py-2">
                  <FolderIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>
                    {entries.length} files upload individually — no zipping, folder structure preserved
                  </span>
                </div>
              )}

              <EmailTagInput emails={recipientEmails} onChange={setRecipientEmails} />

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted flex-shrink-0">Link stays active for</span>
                <div className="flex gap-1.5">
                  {EXPIRY_DAY_OPTIONS.map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setExpiryDays(days)}
                      className={`text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
                        expiryDays === days
                          ? 'bg-accent/10 border-accent text-accent'
                          : 'border-border text-muted hover:border-accent/50 hover:text-text-primary'
                      }`}
                    >
                      {days}d
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-muted">extendable up to {MAX_EXPIRY_DAYS_FROM_UPLOAD}d</span>
              </div>

              <PriceCalculator
                fileSizeBytes={totalSizeBytes}
                walletBalancePaise={balancePaise}
                onPricingChange={setPricing}
              />

              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#00C6FF] flex-shrink-0"
                />
                <span className="text-xs text-muted leading-relaxed">
                  I agree to VayuTransfer&apos;s{' '}
                  <a href="/terms" target="_blank" className="text-accent hover:underline">Terms of Service</a>
                  {' '}and{' '}
                  <a href="/privacy" target="_blank" className="text-accent hover:underline">Privacy Policy</a>.
                  I confirm I have the right to transfer this file.
                </span>
              </label>

              {error && (
                <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">
                  {error}
                </div>
              )}

              <button
                onClick={handleUpload}
                disabled={!canUpload}
                className="w-full bg-accent text-bg font-bold py-4 rounded-xl text-lg hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {!agreedToTerms
                  ? 'Agree to terms to upload'
                  : !canUpload && balancePaise < (pricing?.totalPaise ?? 0)
                  ? 'Add credits to upload'
                  : isBundle
                  ? `Upload ${entries.length} files`
                  : 'Upload & Generate Link'}
              </button>
            </div>

            <div className="md:sticky md:top-24">
              <FilePreviewPanel entries={entries} selectedPath={selectedPath} />
            </div>
          </div>
        )}

        {pageState === 'uploading' && currentUpload && (
          <>
            <UploadProgress
              percent={currentUpload.percent}
              currentChunk={Math.ceil(currentUpload.uploadedBytes / (50 * 1024 * 1024)) || 0}
              totalChunks={Math.ceil(currentUpload.totalBytes / (50 * 1024 * 1024)) || 1}
              fileSizeBytes={currentUpload.totalBytes}
              fileName={currentUpload.fileName}
              speedBytesPerSec={currentUpload.speedBytesPerSec}
              secondsRemaining={currentUpload.secondsRemaining}
              shareableLink={currentUpload.shareableLink ?? undefined}
              error={currentUpload.error}
              onAbort={handleAbort}
              onMinimize={currentUpload.status === 'uploading' ? handleMinimize : undefined}
            />

            {(currentUpload.status === 'done' || currentUpload.status === 'failed') && (
              <button
                onClick={handleMinimize}
                className="w-full text-muted text-sm hover:text-text-primary transition-colors py-2 mt-2"
              >
                Upload another file →
              </button>
            )}
          </>
        )}

      </main>
    </div>
  )
}
