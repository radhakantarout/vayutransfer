'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useWallet } from '@/lib/wallet-context'
import UploadZone from '@/components/UploadZone'
import PriceCalculator from '@/components/PriceCalculator'
import UploadProgress from '@/components/UploadProgress'
import EmailTagInput from '@/components/EmailTagInput'
import { MULTIPART_CHUNK_SIZE_BYTES } from '@/constants/pricing'
import type { PriceBreakdown } from '@/types'

type UploadState = 'idle' | 'pricing' | 'uploading' | 'done'

export default function HomePage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [pricing, setPricing] = useState<PriceBreakdown | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [uploadPercent, setUploadPercent] = useState(0)
  const [currentChunk, setCurrentChunk] = useState(0)
  const [totalChunks, setTotalChunks] = useState(0)
  const [shareableLink, setShareableLink] = useState<string | null>(null)
  const [recipientEmails, setRecipientEmails] = useState<string[]>([])
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data: session } = useSession()
  const { walletId, balancePaise, refreshBalance } = useWallet()

  // Abort refs
  const abortRef = useRef<{ fileId: string; uploadId: string; s3Key: string } | null>(null)
  const abortedRef = useRef(false)

  const handleFileSelect = (file: File) => {
    setSelectedFile(file)
    setUploadState('pricing')
    setShareableLink(null)
    setError(null)
  }

  const handleAbort = async () => {
    abortedRef.current = true
    const ctx = abortRef.current
    if (!ctx || !walletId) return
    try {
      await fetch('/api/upload/multipart/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...ctx, walletId, reason: 'USER_ABANDONED' }),
      })
    } catch {}
    setUploadState('idle')
    setSelectedFile(null)
    setPricing(null)
    abortRef.current = null
    abortedRef.current = false
  }

  // Abort on page unload
  useEffect(() => {
    const onUnload = () => {
      const ctx = abortRef.current
      if (!ctx || !walletId) return
      navigator.sendBeacon(
        '/api/upload/multipart/abort',
        JSON.stringify({ ...ctx, walletId, reason: 'USER_ABANDONED' })
      )
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [walletId])

  const handleUpload = async () => {
    if (!selectedFile || !pricing || !walletId) return
    setError(null)
    setUploadState('uploading')
    abortedRef.current = false

    try {
      // 1. Initiate
      const initRes = await fetch('/api/upload/multipart/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId,
          fileName: selectedFile.name,
          fileSizeBytes: selectedFile.size,
          downloadSlots: pricing.downloadSlots,
          recipientEmails: recipientEmails.length > 0 ? recipientEmails : undefined,
          contentType: selectedFile.type || 'application/octet-stream',
        }),
      })
      const initData = await initRes.json()
      if (!initData.success) {
        setError(initData.message ?? 'Upload failed')
        setUploadState('pricing')
        return
      }

      const { fileId, uploadId, s3Key, totalChunks: chunks } = initData.data
      abortRef.current = { fileId, uploadId, s3Key }
      setTotalChunks(chunks)

      // 2. Upload chunks
      const parts: { PartNumber: number; ETag: string }[] = []

      for (let i = 0; i < chunks; i++) {
        if (abortedRef.current) return

        setCurrentChunk(i + 1)
        setUploadPercent(Math.round((i / chunks) * 95))

        const start = i * MULTIPART_CHUNK_SIZE_BYTES
        const end = Math.min(start + MULTIPART_CHUNK_SIZE_BYTES, selectedFile.size)
        const chunk = selectedFile.slice(start, end)

        // Get presigned URL for this part
        const partRes = await fetch('/api/upload/multipart/part-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId, uploadId, partNumber: i + 1, s3Key, walletId }),
        })
        const partData = await partRes.json()
        if (!partData.success) throw new Error('Failed to get upload URL')

        // PUT chunk directly to S3
        const putRes = await fetch(partData.data.presignedUrl, {
          method: 'PUT',
          body: chunk,
        })
        if (!putRes.ok) throw new Error(`Part ${i + 1} upload failed`)

        const etag = putRes.headers.get('ETag')
        if (!etag) throw new Error('Missing ETag')
        parts.push({ PartNumber: i + 1, ETag: etag })
      }

      if (abortedRef.current) return

      setUploadPercent(98)

      // 3. Complete
      const completeRes = await fetch('/api/upload/multipart/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, uploadId, s3Key, parts, walletId }),
      })
      const completeData = await completeRes.json()
      if (!completeData.success) throw new Error(completeData.message ?? 'Complete failed')

      setUploadPercent(100)
      setShareableLink(completeData.data.shareableLink)
      setUploadState('done')
      abortRef.current = null
      refreshBalance()
    } catch (err) {
      if (!abortedRef.current) {
        setError(err instanceof Error ? err.message : 'Upload failed')
        setUploadState('pricing')
        // Attempt abort/refund
        await handleAbort()
      }
    }
  }

  const canUpload = pricing && walletId && balancePaise >= pricing.totalPaise && agreedToTerms

  return (
    <div className="min-h-screen bg-bg w-full overflow-x-hidden">

      {/* Dev-only banner */}
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
        uploadState === 'pricing' ? 'max-w-4xl' : 'max-w-xl'
      }`}>

        {/* Hero — idle only */}
        {uploadState === 'idle' && (
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

        {/* Idle: single column */}
        {uploadState === 'idle' && (
          <UploadZone onFileSelect={handleFileSelect} />
        )}

        {/* Pricing: two-column layout on desktop */}
        {uploadState === 'pricing' && selectedFile && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">

            {/* Left — upload zone + email + terms + button */}
            <div className="space-y-4">
              <UploadZone onFileSelect={handleFileSelect} file={selectedFile} />

              <EmailTagInput
                emails={recipientEmails}
                onChange={setRecipientEmails}
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
                  : 'Upload & Generate Link'}
              </button>
            </div>

            {/* Right — price calculator, sticky on desktop */}
            <div className="md:sticky md:top-24">
              <PriceCalculator
                fileSizeBytes={selectedFile.size}
                walletBalancePaise={balancePaise}
                onPricingChange={setPricing}
              />
            </div>

          </div>
        )}

        {/* Upload progress */}
        {(uploadState === 'uploading' || uploadState === 'done') && selectedFile && (
          <UploadProgress
            percent={uploadPercent}
            currentChunk={currentChunk}
            totalChunks={totalChunks}
            fileSizeBytes={selectedFile.size}
            fileName={selectedFile.name}
            shareableLink={shareableLink ?? undefined}
            onAbort={handleAbort}
          />
        )}

        {/* Start over */}
        {uploadState === 'done' && (
          <button
            onClick={() => {
              setUploadState('idle')
              setSelectedFile(null)
              setPricing(null)
              setShareableLink(null)
              setRecipientEmails([])
            }}
            className="w-full text-muted text-sm hover:text-text-primary transition-colors py-2"
          >
            Upload another file →
          </button>
        )}
      </main>

    </div>
  )
}
