'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import UploadZone from '@/components/UploadZone'
import PriceCalculator from '@/components/PriceCalculator'
import UploadProgress from '@/components/UploadProgress'
import WalletCard from '@/components/WalletCard'
import TopupModal from '@/components/TopupModal'
import { MULTIPART_CHUNK_SIZE_BYTES } from '@/constants/pricing'
import type { PriceBreakdown } from '@/types'

type UploadState = 'idle' | 'pricing' | 'uploading' | 'done'

export default function HomePage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [pricing, setPricing] = useState<PriceBreakdown | null>(null)
  const [walletId, setWalletId] = useState<string | null>(null)
  const [balancePaise, setBalancePaise] = useState(0)
  const [showTopup, setShowTopup] = useState(false)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [uploadPercent, setUploadPercent] = useState(0)
  const [currentChunk, setCurrentChunk] = useState(0)
  const [totalChunks, setTotalChunks] = useState(0)
  const [shareableLink, setShareableLink] = useState<string | null>(null)
  const [recipientEmail, setRecipientEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Abort refs
  const abortRef = useRef<{ fileId: string; uploadId: string; s3Key: string } | null>(null)
  const abortedRef = useRef(false)

  const handleFileSelect = (file: File) => {
    setSelectedFile(file)
    setUploadState('pricing')
    setShareableLink(null)
    setError(null)
  }

  const handleWalletLoaded = useCallback((wId: string, balance: number) => {
    setWalletId(wId)
    setBalancePaise(balance)
  }, [])

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
          recipientEmail: recipientEmail || undefined,
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
    } catch (err) {
      if (!abortedRef.current) {
        setError(err instanceof Error ? err.message : 'Upload failed')
        setUploadState('pricing')
        // Attempt abort/refund
        await handleAbort()
      }
    }
  }

  const canUpload = pricing && walletId && balancePaise >= pricing.totalPaise

  return (
    <div className="min-h-screen bg-bg">
      {/* Top bar */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <span className="font-bold text-accent text-xl">VayuTransfer</span>
            <span className="text-muted text-sm ml-2 hidden sm:inline">Secure file transfer. Prepaid.</span>
          </div>
          <WalletCard
            onTopup={() => setShowTopup(true)}
            onWalletLoaded={handleWalletLoaded}
          />
        </div>
      </header>

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

      <main className="max-w-xl mx-auto px-4 py-10 space-y-6">
        {/* Hero */}
        {uploadState === 'idle' && (
          <div className="text-center space-y-2 mb-8">
            <h1 className="text-3xl font-bold text-text-primary">
              Send large files.<br />Pay only for what you use.
            </h1>
            <p className="text-muted">No login. No subscription. No surprises.</p>
          </div>
        )}

        {/* Upload zone */}
        {(uploadState === 'idle' || uploadState === 'pricing') && (
          <UploadZone onFileSelect={handleFileSelect} />
        )}

        {/* Price calculator */}
        {uploadState === 'pricing' && selectedFile && (
          <>
            <PriceCalculator
              fileSizeBytes={selectedFile.size}
              walletBalancePaise={balancePaise}
              onPricingChange={setPricing}
            />

            {/* Optional recipient email */}
            <div className="space-y-1">
              <label className="text-sm text-muted">
                Recipient email <span className="text-xs opacity-60">(optional — we'll send the link)</span>
              </label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="recipient@example.com"
                className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-text-primary text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
            </div>

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
              {!canUpload && balancePaise < (pricing?.totalPaise ?? 0)
                ? 'Add credits to upload'
                : 'Upload & Generate Link'}
            </button>
          </>
        )}

        {/* Upload progress */}
        {(uploadState === 'uploading' || uploadState === 'done') && selectedFile && (
          <UploadProgress
            percent={uploadPercent}
            currentChunk={currentChunk}
            totalChunks={totalChunks}
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
              setRecipientEmail('')
            }}
            className="w-full text-muted text-sm hover:text-text-primary transition-colors py-2"
          >
            Upload another file →
          </button>
        )}
      </main>

      {/* Topup modal */}
      {showTopup && walletId && (
        <TopupModal
          walletId={walletId}
          onSuccess={(newBalance) => {
            setBalancePaise(newBalance)
            setShowTopup(false)
          }}
          onClose={() => setShowTopup(false)}
        />
      )}
    </div>
  )
}
