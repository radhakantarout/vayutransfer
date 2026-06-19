'use client'

import { useState, useEffect } from 'react'
import JSZip from 'jszip'
import { useSession, signIn } from 'next-auth/react'
import { useWallet } from '@/lib/wallet-context'
import { useUpload } from '@/lib/upload-context'
import UploadZone from '@/components/UploadZone'
import PriceCalculator from '@/components/PriceCalculator'
import UploadProgress from '@/components/UploadProgress'
import EmailTagInput from '@/components/EmailTagInput'
import type { PriceBreakdown, FileEntry } from '@/types'

type PageState = 'idle' | 'pricing' | 'preparing' | 'uploading'

const MAX_ZIP_BYTES = 5 * 1024 * 1024 * 1024

export default function HomePage() {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [zipProgress, setZipProgress] = useState(0)
  const [pricing, setPricing] = useState<PriceBreakdown | null>(null)
  const [pageState, setPageState] = useState<PageState>('idle')
  const [recipientEmails, setRecipientEmails] = useState<string[]>([])
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentUploadId, setCurrentUploadId] = useState<string | null>(null)

  const { data: session } = useSession()
  const { walletId, balancePaise, refreshBalance } = useWallet()
  const { uploads, startUpload, abortUpload, minimizeUpload } = useUpload()

  const currentUpload = uploads.find(u => u.id === currentUploadId) ?? null

  // Refresh balance once upload completes
  useEffect(() => {
    if (currentUpload?.status === 'done') {
      refreshBalance()
    }
  }, [currentUpload?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalSizeBytes = entries.reduce((s, e) => s + e.file.size, 0)
  const isBundle = entries.length > 1

  const handleFilesSelect = (newEntries: FileEntry[]) => {
    setEntries(newEntries)
    setError(null)
    if (newEntries.length === 0) {
      setPageState('idle')
      setPricing(null)
    } else {
      setPageState('pricing')
    }
  }

  const handleUpload = async () => {
    if (!entries.length || !pricing || !walletId) return
    setError(null)

    let fileToUpload: File

    if (entries.length === 1) {
      fileToUpload = entries[0].file
    } else {
      setPageState('preparing')
      setZipProgress(0)
      try {
        const zip = new JSZip()
        for (const { file, path } of entries) zip.file(path, file)
        const blob = await zip.generateAsync(
          { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
          (meta) => setZipProgress(Math.round(meta.percent))
        )
        fileToUpload = new File([blob], 'package.zip', { type: 'application/zip' })
      } catch {
        setError('Failed to create zip package. Please try again.')
        setPageState('pricing')
        return
      }
    }

    const id = startUpload(fileToUpload, pricing, walletId, recipientEmails)
    setCurrentUploadId(id)
    setPageState('uploading')
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
  }

  const handleMinimize = () => {
    if (currentUploadId) minimizeUpload(currentUploadId)
    setCurrentUploadId(null)
    setPageState('idle')
    setEntries([])
    setPricing(null)
    setRecipientEmails([])
    setAgreedToTerms(false)
  }

  const canUpload =
    pricing &&
    walletId &&
    balancePaise >= pricing.totalPaise &&
    agreedToTerms &&
    (!isBundle || totalSizeBytes <= MAX_ZIP_BYTES)

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

      <main className={`mx-auto px-4 sm:px-6 py-8 sm:py-10 w-full transition-all duration-300 ${
        pageState === 'pricing' ? 'max-w-4xl' : 'max-w-xl'
      }`}>

        {pageState === 'idle' && (
          <div className="text-center space-y-2 mb-8">
            <h1 className="text-3xl font-bold text-text-primary">
              Send large files.<br />Pay only for what you use.
            </h1>
            <p className="text-muted">
              {session
                ? `Welcome back, ${session.user?.name?.split(' ')[0]}! Your wallet is ready.`
                : 'Sign in with Google to get ₹50 free — or transfer anonymously.'}
            </p>
          </div>
        )}

        {pageState === 'idle' && (
          <UploadZone onFilesSelect={handleFilesSelect} />
        )}

        {pageState === 'pricing' && entries.length > 0 && !session && (
          <div className="space-y-4">
            <UploadZone onFilesSelect={handleFilesSelect} entries={entries} />
            <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center gap-4 text-center">
              <div className="text-3xl">🔒</div>
              <div>
                <p className="text-text-primary font-semibold text-lg">Sign in to upload</p>
                <p className="text-muted text-sm mt-1">Get ₹50 free credit instantly</p>
              </div>
              <button
                onClick={() => signIn('google')}
                className="flex items-center gap-2 bg-white text-gray-800 font-semibold px-6 py-3 rounded-xl hover:bg-gray-100 transition-colors shadow-sm"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                  <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                Sign in with Google
              </button>
              <p className="text-xs text-muted">No hidden charges &nbsp;·&nbsp; No credit card required</p>
            </div>
          </div>
        )}

        {pageState === 'pricing' && entries.length > 0 && session && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div className="space-y-4">
              <UploadZone onFilesSelect={handleFilesSelect} entries={entries} />

              {isBundle && (
                <div className="flex items-center gap-2 text-xs text-muted bg-card border border-border rounded-lg px-3 py-2">
                  <span>🗜️</span>
                  <span>
                    {entries.length} files will be bundled into{' '}
                    <strong className="text-text-primary">package.zip</strong> before uploading
                  </span>
                </div>
              )}

              <EmailTagInput emails={recipientEmails} onChange={setRecipientEmails} />

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
                  ? `Bundle & Upload ${entries.length} files`
                  : 'Upload & Generate Link'}
              </button>
            </div>

            <div className="md:sticky md:top-24">
              <PriceCalculator
                fileSizeBytes={totalSizeBytes}
                walletBalancePaise={balancePaise}
                onPricingChange={setPricing}
              />
            </div>
          </div>
        )}

        {pageState === 'preparing' && (
          <div className="bg-card border border-border rounded-xl p-10 flex flex-col items-center gap-5">
            <div className="text-5xl animate-pulse">🗜️</div>
            <div className="text-center">
              <div className="font-semibold text-text-primary text-lg">Preparing package…</div>
              <div className="text-muted text-sm mt-1">
                Compressing {entries.length} files into package.zip
              </div>
            </div>
            <div className="w-full max-w-xs space-y-1">
              <div className="w-full bg-bg rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-200"
                  style={{ width: `${zipProgress}%` }}
                />
              </div>
              <div className="text-center text-accent font-bold text-sm">{zipProgress}%</div>
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
