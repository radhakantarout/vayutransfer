'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import Link from 'next/link'
import QRCode from 'qrcode'
import { useWallet } from '@/lib/wallet-context'
import { useUpload, type ActiveUpload } from '@/lib/upload-context'
import UploadZone from '@/components/UploadZone'
import PriceCalculator from '@/components/PriceCalculator'
import FilePreviewPanel from '@/components/FilePreviewPanel'
import EmailTagInput from '@/components/EmailTagInput'
import ShareButtons from '@/components/ShareButtons'
import FolderTree from '@/components/FolderTree'
import { buildFileTree } from '@/lib/fileTree'
import FeedbackWidget from '@/components/FeedbackWidget'
import {
  ArrowRightIcon, CheckCircleIcon, ClockIcon, RefreshIcon,
  AlertCircleIcon, DownloadIcon, MailIcon, ShareIcon, QrCodeIcon,
  ChevronDownIcon, FileTypeIcon, fileTypeColor, CloseIcon, LockIcon,
} from '@/components/icons'
import { EXPIRY_DAY_OPTIONS, DEFAULT_EXPIRY_DAYS, MAX_EXPIRY_DAYS_FROM_UPLOAD } from '@/constants/pricing'
import type { PriceBreakdown, FileEntry, DriveFileEntry } from '@/types'

const MAX_MESSAGE_CHARS = 200
const MAX_TITLE_CHARS = 100
type Step = 'select' | 'review' | 'uploading' | 'complete'

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function formatSpeed(bps: number): string {
  if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`
  return `${bps.toFixed(0)} B/s`
}

function formatTime(secs: number): string {
  if (!isFinite(secs) || secs <= 0) return 'calculating…'
  if (secs < 60) return `${Math.round(secs)}s left`
  if (secs < 3600) return `${Math.round(secs / 60)} min left`
  return `${(secs / 3600).toFixed(1)}h left`
}

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

export interface TransferFlowProps {
  // 'dedicated' = /transfer/new: requires a signed-in session up front
  // (redirects to /login before rendering anything), plain full-page layout.
  // 'embedded' = homepage: anonymous visitors can select and preview files
  // freely (the "no sign up required" promise), gated only at the review
  // step where a real transfer/wallet deduction is about to be committed.
  variant: 'dedicated' | 'embedded'
  // 'embedded' only — wraps the empty-state dropzone with the homepage's
  // own hero copy / side card / marketing sections. Ignored once anything
  // is selected or an upload is in flight. Falls back to a plain centered
  // dropzone (matching /transfer/new) when omitted.
  renderIdle?: (dropzone: React.ReactNode) => React.ReactNode
}

export default function TransferFlow({ variant, renderIdle }: TransferFlowProps) {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (variant === 'dedicated' && status === 'unauthenticated') router.replace('/login')
  }, [variant, status, router])

  const { walletId, balancePaise, refreshBalance } = useWallet()
  const {
    uploads, startUpload, startBatchUpload, startDriveImport,
    abortUpload, retryUpload, retryBatchFile, retryAllFailedBatchFiles, skipBatchFailedFiles,
  } = useUpload()

  const [step, setStep] = useState<Step>('select')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [driveSelection, setDriveSelection] = useState<DriveFileEntry[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [pricing, setPricing] = useState<PriceBreakdown | null>(null)
  const [recipientEmails, setRecipientEmails] = useState<string[]>([])
  const [displayName, setDisplayName] = useState('')
  const [titleTouched, setTitleTouched] = useState(false)
  const [message, setMessage] = useState('')
  const [senderNotifyEmail, setSenderNotifyEmail] = useState('')
  const [expiryDays, setExpiryDays] = useState<number>(DEFAULT_EXPIRY_DAYS)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentUploadId, setCurrentUploadId] = useState<string | null>(null)

  const currentUpload = uploads.find((u) => u.id === currentUploadId) ?? null

  useEffect(() => {
    if (currentUpload?.status === 'done') refreshBalance()
  }, [currentUpload?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentUpload?.status === 'uploading' || currentUpload?.status === 'partial') setStep('uploading')
    if (currentUpload?.status === 'done') setStep('complete')
  }, [currentUpload?.status])

  // Safety: if the tracked upload was dismissed from the global tray while
  // this component was still pointing at it, fall back to the empty state
  // instead of getting stuck on a step with nothing to render.
  useEffect(() => {
    if (currentUploadId && !currentUpload) resetAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUploadId, currentUpload])

  const totalCount = entries.length + driveSelection.length
  const totalSizeBytes = entries.reduce((s, e) => s + e.file.size, 0) + driveSelection.reduce((s, f) => s + f.sizeBytes, 0)
  // Folders aren't separate selectable rows (drag-drop flattens straight to
  // individual files with a path) — this counts distinct top-level folder
  // names among local entries, matching UploadZone.tsx's own summary line.
  const folderCount = new Set(entries.filter((e) => e.path.includes('/')).map((e) => e.path.split('/')[0])).size
  const fileCount = totalCount - folderCount

  const handleFilesSelect = (newEntries: FileEntry[]) => {
    setEntries(newEntries)
    setError(null)
    if (newEntries.length > 0 && !newEntries.some((e) => e.path === selectedPath)) setSelectedPath(newEntries[0].path)
  }
  const handleDriveFilesSelect = (files: DriveFileEntry[]) => {
    setDriveSelection(files)
    setError(null)
    if (files.length > 0 && !files.some((f) => f.relativePath === selectedPath)) setSelectedPath(files[0].relativePath)
  }

  // "← Back" from step 2 — clears the selection to return to the empty
  // dropzone, distinct from step 3's back (which keeps the selection intact).
  const clearSelection = () => {
    setEntries([])
    setDriveSelection([])
    setSelectedPath(null)
  }

  const titleValid = displayName.trim().length > 0
  const canUpload = !!walletId && agreedToTerms && titleValid && !!pricing && balancePaise >= (pricing?.totalPaise ?? 0)

  const handleCreateTransfer = () => {
    if (!pricing || !walletId || totalCount === 0) return
    if (!titleValid) { setTitleTouched(true); return }
    setError(null)
    const trimmedMessage = message.trim() || undefined
    const trimmedNotify = senderNotifyEmail.trim() || undefined
    const trimmedTitle = displayName.trim()
    const id = driveSelection.length > 0
      ? startDriveImport(
          driveSelection.map((f) => ({ id: f.driveFileId, mimeType: f.mimeType })),
          driveSelection.length === 1 ? driveSelection[0].name : `${driveSelection.length} files`,
          totalSizeBytes, walletId, recipientEmails, expiryDays, trimmedMessage, trimmedNotify, trimmedTitle
        )
      : entries.length === 1
      ? startUpload(entries[0].file, pricing, walletId, recipientEmails, expiryDays, trimmedMessage, trimmedNotify, trimmedTitle)
      : startBatchUpload(entries, pricing, walletId, recipientEmails, expiryDays, trimmedMessage, trimmedNotify, trimmedTitle)
    setCurrentUploadId(id)
    setStep('uploading')
    setEntries([])
    setDriveSelection([])
  }

  const resetAll = () => {
    setStep('select')
    setEntries([]); setDriveSelection([]); setSelectedPath(null)
    setPricing(null); setRecipientEmails([]); setDisplayName(''); setTitleTouched(false)
    setMessage(''); setSenderNotifyEmail('')
    setExpiryDays(DEFAULT_EXPIRY_DAYS); setShowAdvanced(false); setAgreedToTerms(false)
    setCurrentUploadId(null); setError(null)
  }

  if (variant === 'dedicated' && (status === 'loading' || status === 'unauthenticated')) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const dropzoneCard = (
    <UploadZone
      onFilesSelect={handleFilesSelect}
      entries={entries}
      // Google Drive import temporarily disabled — see
      // memory/drive_import_size_cap.md. Not passing onDriveFilesSelect
      // (UploadZone only renders the Drive button when it's set) is the
      // whole change; nothing else in this file needed to move since
      // driveSelection simply stays permanently empty now. Re-add these
      // two props to re-enable.
    />
  )

  // Anonymous visitors on the homepage: the empty dropzone card looks and
  // sounds fully interactive (Browse Files, Google Drive, drag-drop) but
  // none of it should actually run until they have an account — a
  // transparent overlay catches every click on the card (including on its
  // own inner buttons) and sends them to /signup instead, without dimming
  // the card the way UploadZone's own `disabled` prop would (that's for
  // mid-upload states, not this — the card should still look inviting).
  // Only applies to the empty-state card; once files are picked (which
  // can't happen here since the overlay blocks that) the rest of the flow
  // already gates at the review step instead.
  const dropzone = variant === 'embedded' && !session ? (
    <div className="relative cursor-pointer" onClick={() => router.push('/signup')}>
      <div className="absolute inset-0 z-10" />
      {dropzoneCard}
    </div>
  ) : dropzoneCard

  return (
    <div className={variant === 'dedicated' ? 'min-h-[calc(100vh-56px)] py-10 px-4' : 'w-full'}>
      {/* Deep-link support: /transfer/new?tx=<transferId> (e.g. clicked from
          the "Uploading…" badge on /transfers) attaches this instance to an
          already-running upload tracked in the global context, landing
          straight on step 4 via the status-sync effect above. No-ops
          silently if `tx` doesn't match anything currently tracked (stale
          link, different browser/tab, or the upload already finished and
          was dismissed). */}
      {variant === 'dedicated' && (
        <Suspense fallback={null}>
          <TxAttacher uploads={uploads} currentUploadId={currentUploadId} onAttach={setCurrentUploadId} />
        </Suspense>
      )}

      {/* Step 1 — empty dropzone */}
      {step === 'select' && totalCount === 0 && (
        renderIdle ? renderIdle(dropzone) : <div className="max-w-md mx-auto">{dropzone}</div>
      )}

      {/* Step 2 — files selected, with preview panel alongside */}
      {step === 'select' && totalCount > 0 && (
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div className="space-y-4">
            <button
              onClick={clearSelection}
              className="flex items-center gap-1.5 text-sm text-muted hover:text-text-primary transition-colors"
            >
              ← Back
            </button>
            <UploadZone
              onFilesSelect={handleFilesSelect}
              entries={entries}
              selectedPath={selectedPath}
              onSelectPath={setSelectedPath}
              enableDuplicateCheck
            />
            <button
              onClick={() => setStep('review')}
              className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-accent to-[#7C3AED] text-white font-bold py-3.5 rounded-xl hover:opacity-90 transition-opacity"
            >
              Continue <ArrowRightIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="md:sticky md:top-10">
            <FilePreviewPanel entries={entries} driveEntries={driveSelection} selectedPath={selectedPath} />
          </div>
        </div>
      )}

      {/* Step 3 — review & prepare */}
      {step === 'review' && variant === 'embedded' && !session && (
        <div className="max-w-md mx-auto space-y-4">
          <button
            onClick={() => setStep('select')}
            className="flex items-center gap-1.5 text-sm text-muted hover:text-text-primary transition-colors"
          >
            ← Back
          </button>
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

      {step === 'review' && (variant === 'dedicated' || !!session) && (
        <div className="max-w-md mx-auto space-y-4">
          <button
            onClick={() => setStep('select')}
            className="flex items-center gap-1.5 text-sm text-muted hover:text-text-primary transition-colors"
          >
            ← Back
          </button>
          <div className="border border-border rounded-2xl overflow-hidden shadow-sm bg-card">
            <div className="px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold text-text-primary">Review Your Transfer</span>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between bg-bg border border-border rounded-lg px-3 py-2.5">
                <div className="text-xs text-muted">
                  <span className="font-semibold text-text-primary">{totalCount}</span> items
                  {folderCount > 0 && <> · {folderCount} {folderCount === 1 ? 'folder' : 'folders'} · {fileCount} {fileCount === 1 ? 'file' : 'files'}</>}
                  <span className="block text-text-primary font-semibold mt-0.5">{formatBytes(totalSizeBytes)}</span>
                </div>
                <button onClick={() => setStep('select')} className="text-xs font-semibold text-accent hover:underline flex-shrink-0">
                  Edit items
                </button>
              </div>

              <div>
                <label className="text-sm text-muted block mb-1.5">
                  Give a title to this transfer <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value.slice(0, MAX_TITLE_CHARS))}
                  onBlur={() => setTitleTouched(true)}
                  placeholder="e.g. Wedding photos, Q3 report..."
                  className={`w-full bg-bg border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-muted focus:outline-none transition-colors ${
                    titleTouched && !titleValid ? 'border-danger focus:border-danger' : 'border-border focus:border-accent/60'
                  }`}
                />
                <div className="flex items-center justify-between mt-1">
                  {titleTouched && !titleValid ? (
                    <span className="text-[11px] text-danger">A title is required</span>
                  ) : <span />}
                  <span className="text-[11px] text-muted">{displayName.length}/{MAX_TITLE_CHARS}</span>
                </div>
              </div>

              <EmailTagInput emails={recipientEmails} onChange={setRecipientEmails} />

              <div>
                <label className="text-sm text-muted block mb-1.5">Your email (optional)</label>
                <input
                  type="email"
                  value={senderNotifyEmail}
                  onChange={(e) => setSenderNotifyEmail(e.target.value)}
                  placeholder="your.email@gmail.com"
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60"
                />
                <p className="text-[11px] text-muted mt-1">We&apos;ll email you when your files are downloaded.</p>
              </div>

              <div>
                <label className="text-sm text-muted block mb-1.5">Message (optional)</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_CHARS))}
                  placeholder="Hi! Please find the files..."
                  rows={2}
                  maxLength={MAX_MESSAGE_CHARS}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60 resize-none"
                />
                <div className="text-right text-[11px] text-muted mt-1">{message.length}/{MAX_MESSAGE_CHARS}</div>
              </div>

              <div>
                <button
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="flex items-center gap-1.5 text-sm text-muted hover:text-text-primary transition-colors"
                >
                  <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                  Advanced options
                </button>
                {showAdvanced && (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
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
                )}
              </div>

              <PriceCalculator fileSizeBytes={totalSizeBytes} walletBalancePaise={balancePaise} onPricingChange={setPricing} />

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
                <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">{error}</div>
              )}

              <button
                onClick={handleCreateTransfer}
                disabled={!canUpload}
                className="w-full bg-gradient-to-r from-accent to-[#7C3AED] text-white font-bold py-3.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {!titleValid
                  ? 'Give this transfer a title'
                  : !agreedToTerms
                  ? 'Agree to terms to upload'
                  : !canUpload && balancePaise < (pricing?.totalPaise ?? 0)
                  ? 'Add credits to upload'
                  : 'Create Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4 — uploading */}
      {step === 'uploading' && currentUpload && (
        <div className="max-w-xl mx-auto">
          <UploadingStep
            upload={currentUpload}
            onAbort={async () => {
              // Cancelling mid-transfer removes this upload from the global
              // tray entirely (see lib/upload-context.tsx#abortUpload) — if
              // step stayed 'uploading' afterward, currentUpload would go
              // null and nothing would render. Resetting to the empty state
              // avoids that blank-page dead end; the dedicated page also
              // redirects home per the original request.
              await abortUpload(currentUpload.id)
              resetAll()
              if (variant === 'dedicated') router.push('/')
            }}
            onRetry={() => retryUpload(currentUpload.id)}
            onRetryFile={(fileId) => retryBatchFile(currentUpload.id, fileId)}
            onRetryAllFailed={() => retryAllFailedBatchFiles(currentUpload.id)}
            onSkipFailed={() => skipBatchFailedFiles(currentUpload.id)}
          />
        </div>
      )}

      {/* Step 5 — upload complete */}
      {step === 'complete' && currentUpload?.status === 'done' && currentUpload.shareableLink && (
        <div className="max-w-md mx-auto">
          <CompleteStep upload={currentUpload} totalCount={totalCount} onCreateAnother={resetAll} />
        </div>
      )}
    </div>
  )
}

// useSearchParams() needs its own Suspense boundary per Next.js's App
// Router rules — isolated here so only the 'dedicated' variant pays for it.
function TxAttacher({
  uploads, currentUploadId, onAttach,
}: {
  uploads: ActiveUpload[]
  currentUploadId: string | null
  onAttach: (id: string) => void
}) {
  const searchParams = useSearchParams()
  useEffect(() => {
    if (currentUploadId) return
    const tx = searchParams.get('tx')
    if (!tx) return
    const match = uploads.find((u) => u.transferId === tx)
    if (match) onAttach(match.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, uploads, currentUploadId])
  return null
}

// ─── Step 4 — Uploading ─────────────────────────────────────────────────────
function UploadingStep({
  upload, onAbort, onRetry, onRetryFile, onRetryAllFailed, onSkipFailed,
}: {
  upload: ActiveUpload
  onAbort: () => void
  onRetry: () => void
  onRetryFile: (fileId: string) => void
  onRetryAllFailed: () => void
  onSkipFailed: () => void
}) {
  const hasFailed = (upload.batchFiles ?? []).some((f) => f.status === 'failed')

  if (upload.error && !upload.batchFiles) {
    return (
      <div className="bg-card border border-danger/40 rounded-2xl p-6 space-y-3">
        <div className="flex items-center gap-3">
          <AlertCircleIcon className="w-6 h-6 text-danger flex-shrink-0" />
          <div className="font-semibold text-danger">Upload failed</div>
        </div>
        <div className="text-sm text-danger/80 bg-danger/10 rounded-lg px-3 py-2">{upload.error}</div>
        <div className="flex gap-3">
          <button onClick={onRetry} className="text-accent text-sm font-semibold hover:underline">Retry</button>
          <button onClick={onAbort} className="text-danger text-sm hover:underline">Cancel & refund</button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-text-primary">Uploading your files...</div>
        <div className="text-lg font-bold text-accent tabular-nums">{upload.percent}%</div>
      </div>
      <div className="text-xs text-muted -mt-3">
        {formatBytes(upload.uploadedBytes)} of {formatBytes(upload.totalBytes)} · {formatTime(upload.secondsRemaining)}
      </div>

      <div className="w-full bg-bg rounded-full h-2 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-accent to-[#7C3AED] rounded-full transition-all duration-300" style={{ width: `${upload.percent}%` }} />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-bg border border-border rounded-xl px-3 py-2.5 text-center">
          <div className="text-sm font-bold text-text-primary tabular-nums">{upload.speedBytesPerSec > 0 ? formatSpeed(upload.speedBytesPerSec) : '—'}</div>
          <div className="text-[11px] text-muted">Upload speed</div>
        </div>
        <div className="bg-bg border border-border rounded-xl px-3 py-2.5 text-center">
          <div className="text-sm font-bold text-text-primary tabular-nums">{formatTime(upload.secondsRemaining).replace(' left', '')}</div>
          <div className="text-[11px] text-muted">Time left</div>
        </div>
        <div className="bg-bg border border-border rounded-xl px-3 py-2.5 text-center">
          <div className="text-sm font-bold text-text-primary tabular-nums">
            {upload.batchFiles ? `${upload.batchFiles.filter((f) => f.status === 'done' || f.status === 'skipped').length}/${upload.batchFiles.length}` : `${Math.round(upload.percent)}%`}
          </div>
          <div className="text-[11px] text-muted">Items</div>
        </div>
      </div>

      {/* Per-file table */}
      {upload.batchFiles && (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="max-h-64 overflow-y-auto divide-y divide-border">
            <FolderTree
              tree={buildFileTree(upload.batchFiles, (f) => f.path)}
              renderFile={(f) => (
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-7 h-7 rounded-lg bg-bg flex items-center justify-center flex-shrink-0">
                    <FileTypeIcon fileName={f.path} className={`w-3.5 h-3.5 ${fileTypeColor(f.path)}`} />
                  </span>
                  <span className="flex-1 min-w-0 text-xs text-text-primary truncate">{f.path.split('/').pop()}</span>
                  <span className="text-[11px] text-muted flex-shrink-0">{formatBytes(f.sizeBytes)}</span>
                  {f.status === 'done' && <CheckCircleIcon className="w-4 h-4 text-success flex-shrink-0" />}
                  {f.status === 'skipped' && <span className="text-[11px] text-muted flex-shrink-0">Skipped</span>}
                  {f.status === 'pending' && <ClockIcon className="w-4 h-4 text-muted flex-shrink-0" />}
                  {f.status === 'uploading' && <span className="w-3.5 h-3.5 border-2 border-accent/40 border-t-accent rounded-full animate-spin flex-shrink-0" />}
                  {f.status === 'failed' && (
                    <button onClick={() => onRetryFile(f.fileId)} className="flex items-center gap-1 text-[11px] font-medium text-accent hover:underline flex-shrink-0">
                      <RefreshIcon className="w-3 h-3" /> Retry{f.retryCount > 0 ? ` (${f.retryCount})` : ''}
                    </button>
                  )}
                </div>
              )}
            />
          </div>
        </div>
      )}

      {hasFailed && (
        <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2.5">
          <AlertCircleIcon className="w-4 h-4 text-yellow-500 flex-shrink-0" />
          <span className="text-xs text-text-primary flex-1">Some files failed to upload.</span>
          <button onClick={onRetryAllFailed} className="text-xs font-semibold text-accent hover:underline flex-shrink-0">Retry All Failed</button>
          <button onClick={onSkipFailed} className="text-xs font-semibold text-text-primary hover:underline flex-shrink-0">Skip & Finish</button>
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <button onClick={onAbort} className="border border-danger/30 text-danger text-sm font-semibold px-4 py-2 rounded-lg hover:bg-danger/10 transition-colors">
          Cancel Transfer
        </button>
      </div>
    </div>
  )
}

// ─── Step 5 — Upload Complete ───────────────────────────────────────────────
function CompleteStep({ upload, totalCount, onCreateAnother }: { upload: ActiveUpload; totalCount: number; onCreateAnother: () => void }) {
  const [copied, setCopied] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const link = upload.shareableLink!

  useEffect(() => () => { if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current) }, [])

  const copyLink = async () => {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
    copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
  }

  const openQr = async () => {
    if (!qrDataUrl) {
      const dataUrl = await QRCode.toDataURL(link, { width: 240, margin: 2, color: { dark: '#0B0F1A', light: '#FFFFFF' } })
      setQrDataUrl(dataUrl)
    }
    setShowQr(true)
  }

  const downloadInfo = () => {
    const lines = [
      `VayuTransfer — ${upload.fileName}`,
      `Link: ${link}`,
      `Size: ${formatBytes(upload.totalBytes)}`,
      `Items: ${totalCount}`,
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'vayutransfer-link.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const emailHref = `mailto:?subject=${encodeURIComponent('File ready on VayuTransfer')}&body=${encodeURIComponent(`Here's your download link:\n\n${link}`)}`

  return (
    <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-5 relative overflow-hidden">
      {/* Confetti — CSS-only burst, runs once */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {Array.from({ length: 24 }).map((_, i) => (
          <span
            key={i}
            className="absolute w-1.5 h-1.5 rounded-sm motion-safe:animate-[confetti_1.4s_ease-out_forwards]"
            style={{
              left: `${(i * 37) % 100}%`,
              top: '40%',
              backgroundColor: ['#00C6FF', '#7C3AED', '#FBBF24', '#34D399'][i % 4],
              animationDelay: `${(i % 6) * 40}ms`,
              transform: `rotate(${(i * 53) % 360}deg)`,
            }}
          />
        ))}
      </div>

      <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-dashed border-success/40 motion-safe:animate-[spin_8s_linear_infinite]" />
        <div className="w-14 h-14 rounded-full bg-success/15 flex items-center justify-center">
          <CheckCircleIcon className="w-8 h-8 text-success" />
        </div>
      </div>

      <div>
        <div className="text-xl font-bold text-text-primary">Your transfer is ready!</div>
        <div className="text-sm text-muted mt-1">{formatBytes(upload.totalBytes)} · {totalCount} {totalCount === 1 ? 'item' : 'items'}</div>
      </div>

      <div className="flex gap-2">
        <input readOnly value={link} className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text-primary font-mono truncate focus:outline-none" />
        <button onClick={copyLink} className="px-4 py-2 bg-accent text-bg font-semibold rounded-lg text-sm hover:bg-accent/90 transition-colors whitespace-nowrap">
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <button onClick={() => setShowShare((v) => !v)} className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-border hover:border-accent/60 transition-colors text-xs text-muted hover:text-text-primary">
          <ShareIcon className="w-4 h-4" /> Share
        </button>
        <a href={emailHref} className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-border hover:border-accent/60 transition-colors text-xs text-muted hover:text-text-primary">
          <MailIcon className="w-4 h-4" /> Email
        </a>
        <button onClick={openQr} className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-border hover:border-accent/60 transition-colors text-xs text-muted hover:text-text-primary">
          <QrCodeIcon className="w-4 h-4" /> QR Code
        </button>
        <button onClick={downloadInfo} className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-border hover:border-accent/60 transition-colors text-xs text-muted hover:text-text-primary">
          <DownloadIcon className="w-4 h-4" /> Info
        </button>
      </div>

      {showShare && <ShareButtons link={link} fileName={upload.fileName} size="sm" />}

      <Link href={link.replace('/download/', '/transfer/')} className="block text-xs text-accent hover:underline">
        Manage this transfer →
      </Link>

      {upload.transferId && (
        <div className="text-left">
          <FeedbackWidget subjectType="transfer" subjectId={upload.transferId} role="sender" />
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Link href="/transfers" className="flex-1 border border-border text-text-primary text-sm font-semibold py-3 rounded-xl hover:border-accent/60 transition-colors text-center">
          Go to My Transfers
        </Link>
        <button onClick={onCreateAnother} className="flex-1 bg-gradient-to-r from-accent to-[#7C3AED] text-white text-sm font-bold py-3 rounded-xl hover:opacity-90 transition-opacity">
          Create Another
        </button>
      </div>

      {showQr && qrDataUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowQr(false)}>
          <div className="bg-white rounded-2xl p-6 space-y-4 text-center" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR code for the transfer link" className="w-60 h-60" />
            <button onClick={() => setShowQr(false)} className="flex items-center justify-center gap-1.5 mx-auto text-sm text-gray-600 hover:text-gray-900">
              <CloseIcon className="w-4 h-4" /> Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
