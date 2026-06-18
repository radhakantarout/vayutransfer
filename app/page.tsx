'use client'

import { useState, useRef, useEffect } from 'react'
import JSZip from 'jszip'
import { useSession } from 'next-auth/react'
import { useWallet } from '@/lib/wallet-context'
import UploadZone from '@/components/UploadZone'
import PriceCalculator from '@/components/PriceCalculator'
import UploadProgress from '@/components/UploadProgress'
import EmailTagInput from '@/components/EmailTagInput'
import { MULTIPART_CHUNK_SIZE_BYTES } from '@/constants/pricing'
import type { PriceBreakdown, FileEntry } from '@/types'

type UploadState = 'idle' | 'pricing' | 'preparing' | 'uploading' | 'done'

const MAX_ZIP_BYTES = 5 * 1024 * 1024 * 1024  // 5 GB

export default function HomePage() {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [zipProgress, setZipProgress] = useState(0)
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

  const abortRef = useRef<{ fileId: string; uploadId: string; s3Key: string } | null>(null)
  const abortedRef = useRef(false)

  const totalSizeBytes = entries.reduce((s, e) => s + e.file.size, 0)
  const isBundle = entries.length > 1

  const handleFilesSelect = (newEntries: FileEntry[]) => {
    setEntries(newEntries)
    setUploadFile(null)
    setError(null)
    setShareableLink(null)
    if (newEntries.length === 0) {
      setUploadState('idle')
      setPricing(null)
    } else {
      setUploadState('pricing')
    }
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
    setEntries([])
    setUploadFile(null)
    setPricing(null)
    abortRef.current = null
    abortedRef.current = false
  }

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
    if (!entries.length || !pricing || !walletId) return
    setError(null)
    abortedRef.current = false

    let fileToUpload: File

    if (entries.length === 1) {
      fileToUpload = entries[0].file
    } else {
      // Zip phase
      setUploadState('preparing')
      setZipProgress(0)
      try {
        const zip = new JSZip()
        for (const { file, path } of entries) {
          zip.file(path, file)
        }
        const zipBlob = await zip.generateAsync(
          { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
          (meta) => setZipProgress(Math.round(meta.percent))
        )
        fileToUpload = new File([zipBlob], 'package.zip', { type: 'application/zip' })
      } catch {
        setError('Failed to create zip package. Please try again.')
        setUploadState('pricing')
        return
      }
    }

    setUploadFile(fileToUpload)
    setUploadState('uploading')

    try {
      // 1. Initiate
      const initRes = await fetch('/api/upload/multipart/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId,
          fileName: fileToUpload.name,
          fileSizeBytes: fileToUpload.size,
          downloadSlots: pricing.downloadSlots,
          recipientEmails: recipientEmails.length > 0 ? recipientEmails : undefined,
          contentType: fileToUpload.type || 'application/octet-stream',
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
        const end = Math.min(start + MULTIPART_CHUNK_SIZE_BYTES, fileToUpload.size)
        const chunk = fileToUpload.slice(start, end)

        const partRes = await fetch('/api/upload/multipart/part-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId, uploadId, partNumber: i + 1, s3Key, walletId }),
        })
        const partData = await partRes.json()
        if (!partData.success) throw new Error('Failed to get upload URL')

        const putRes = await fetch(partData.data.presignedUrl, { method: 'PUT', body: chunk })
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
        await handleAbort()
      }
    }
  }

  const canUpload =
    pricing &&
    walletId &&
    balancePaise >= pricing.totalPaise &&
    agreedToTerms &&
    totalSizeBytes <= MAX_ZIP_BYTES

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

        {/* Idle: drop zone */}
        {uploadState === 'idle' && (
          <UploadZone onFilesSelect={handleFilesSelect} />
        )}

        {/* Pricing: two-column layout */}
        {uploadState === 'pricing' && entries.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">

            {/* Left — file list + form */}
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

            {/* Right — price calculator */}
            <div className="md:sticky md:top-24">
              <PriceCalculator
                fileSizeBytes={totalSizeBytes}
                walletBalancePaise={balancePaise}
                onPricingChange={setPricing}
              />
            </div>

          </div>
        )}

        {/* Preparing — zip in progress */}
        {uploadState === 'preparing' && (
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

        {/* Upload progress */}
        {(uploadState === 'uploading' || uploadState === 'done') && uploadFile && (
          <UploadProgress
            percent={uploadPercent}
            currentChunk={currentChunk}
            totalChunks={totalChunks}
            fileSizeBytes={uploadFile.size}
            fileName={uploadFile.name}
            shareableLink={shareableLink ?? undefined}
            onAbort={handleAbort}
          />
        )}

        {/* Start over */}
        {uploadState === 'done' && (
          <button
            onClick={() => {
              setUploadState('idle')
              setEntries([])
              setUploadFile(null)
              setPricing(null)
              setShareableLink(null)
              setRecipientEmails([])
              setAgreedToTerms(false)
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
