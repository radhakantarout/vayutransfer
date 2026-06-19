'use client'

import { useState, useEffect } from 'react'
import JSZip from 'jszip'
import { useSession } from 'next-auth/react'
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

        {pageState === 'pricing' && entries.length > 0 && (
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

              {/* EmailTagInput disabled until AWS SES production access is approved */}
              {/* <EmailTagInput emails={recipientEmails} onChange={setRecipientEmails} /> */}

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
