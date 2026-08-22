'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import QRCode from 'qrcode'
import EmailTagInput from '@/components/EmailTagInput'
import ShareButtons from '@/components/ShareButtons'
import {
  InboxIcon, FolderIcon, PackageIcon, CheckCircleIcon, ChevronDownIcon,
  MailIcon, ShareIcon, QrCodeIcon, DownloadIcon, CloseIcon,
} from '@/components/icons'
import { EXPIRY_DAY_OPTIONS, MAX_FILE_SIZE_GB } from '@/constants/pricing'

const MAX_MESSAGE_CHARS = 200
const MAX_TITLE_CHARS = 100
type Step = 'idle' | 'options' | 'review' | 'created'
type SizeUnit = 'MB' | 'GB'
type ShareTab = 'share' | 'invite'

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(bytes % (1024 * 1024 * 1024) === 0 ? 0 : 1)} GB`
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
}

export default function RequestFlow() {
  const { status } = useSession()
  const router = useRouter()
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
  }, [status, router])

  const [step, setStep] = useState<Step>('idle')

  const [requestTitle, setRequestTitle] = useState('')
  const [allowUpValue, setAllowUpValue] = useState(20)
  const [allowUpUnit, setAllowUpUnit] = useState<SizeUnit>('GB')
  const [expiryDays, setExpiryDays] = useState<number>(7)
  const [accessMode, setAccessMode] = useState<'anyone' | 'invited'>('anyone')
  const [invitedEmails, setInvitedEmails] = useState<string[]>([])
  const [notifyOnUpload, setNotifyOnUpload] = useState(true)
  const [message, setMessage] = useState('Thanks for sharing! Please upload everything in original quality if possible.')
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ requestId: string; receiveLink: string; expiryTime: string } | null>(null)

  const maxBytesRaw = allowUpUnit === 'GB' ? allowUpValue * 1024 * 1024 * 1024 : allowUpValue * 1024 * 1024
  const platformMaxBytes = MAX_FILE_SIZE_GB * 1024 * 1024 * 1024
  const maxSizeBytes = Math.min(Math.max(maxBytesRaw, 0), platformMaxBytes)

  const canCreate = agreedToTerms && requestTitle.trim().length > 0 && (accessMode === 'anyone' || invitedEmails.length > 0)

  const handleCreate = async () => {
    if (!canCreate || creating) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/receive-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestTitle: requestTitle.trim(),
          message: message.trim() || undefined,
          expiryDays,
          maxSizeBytes,
          accessMode,
          invitedEmails: accessMode === 'invited' ? invitedEmails : undefined,
          notifyOnUpload,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.message ?? 'Failed to create request')
        return
      }
      setCreated(data.data)
      setStep('created')
    } catch {
      setError('Network error — please try again')
    } finally {
      setCreating(false)
    }
  }

  const resetAll = () => {
    setStep('idle')
    setRequestTitle('')
    setAllowUpValue(20)
    setAllowUpUnit('GB')
    setExpiryDays(7)
    setAccessMode('anyone')
    setInvitedEmails([])
    setNotifyOnUpload(true)
    setMessage('Thanks for sharing! Please upload everything in original quality if possible.')
    setAgreedToTerms(false)
    setCreated(null)
    setError(null)
  }

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-56px)] py-10 px-4">
      {/* Step 1 — idle CTA */}
      {step === 'idle' && (
        <div className="max-w-md mx-auto">
          <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-b from-accent to-[#7C3AED] text-white flex items-center justify-center shadow-lg shadow-accent/25">
              <InboxIcon className="w-7 h-7" />
            </div>
            <div>
              <div className="font-bold text-text-primary text-lg">Request files from anyone</div>
              <p className="text-sm text-text-primary/80 mt-1.5 leading-relaxed">
                Get files, photos, videos or documents directly to your VayuTransfer — no account needed on their end.
              </p>
            </div>
            <button
              onClick={() => setStep('options')}
              className="w-full bg-gradient-to-r from-accent to-[#7C3AED] text-white font-bold py-3.5 rounded-xl hover:opacity-90 transition-opacity"
            >
              Request Files
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — set request options (title, size cap, expiry, access, notifications, message) */}
      {step === 'options' && (
        <div className="max-w-md mx-auto space-y-4">
          <button
            onClick={() => setStep('idle')}
            className="flex items-center gap-1.5 text-sm text-muted hover:text-text-primary transition-colors"
          >
            ← Back
          </button>
          <div className="border border-border rounded-2xl overflow-hidden shadow-sm bg-card">
            <div className="px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold text-text-primary">Set request options</span>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-text-primary block mb-1.5">Request title</label>
                <input
                  type="text"
                  value={requestTitle}
                  onChange={(e) => setRequestTitle(e.target.value.slice(0, MAX_TITLE_CHARS))}
                  placeholder="e.g. Japan Trip Photos"
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60"
                />
                <div className="text-right text-[11px] text-muted mt-1">{requestTitle.length}/{MAX_TITLE_CHARS}</div>
              </div>

              <div>
                <label className="text-sm font-medium text-text-primary block mb-1.5">
                  Allow up to <span className="text-[11px] font-normal text-muted">(max {MAX_FILE_SIZE_GB}GB)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    value={allowUpValue}
                    onChange={(e) => setAllowUpValue(Math.max(1, Number(e.target.value) || 1))}
                    className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/60"
                  />
                  <select
                    value={allowUpUnit}
                    onChange={(e) => setAllowUpUnit(e.target.value as SizeUnit)}
                    className="bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/60"
                  >
                    <option value="MB">MB</option>
                    <option value="GB">GB</option>
                  </select>
                </div>
                <p className="text-[11px] text-muted mt-1">Maximum total size across everything uploaded to this request.</p>
              </div>

              <div>
                <label className="text-sm font-medium text-text-primary block mb-1.5">Request expires in</label>
                <div className="flex gap-1.5">
                  {EXPIRY_DAY_OPTIONS.map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setExpiryDays(days)}
                      className={`flex-1 text-sm font-medium py-2 rounded-lg border transition-colors ${
                        expiryDays === days
                          ? 'bg-accent/10 border-accent text-accent'
                          : 'border-border text-muted hover:border-accent/50 hover:text-text-primary'
                      }`}
                    >
                      {days} days
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted mt-1">Request will automatically expire and stop accepting uploads.</p>
              </div>

              <div>
                <label className="text-sm font-medium text-text-primary block mb-2">Who can upload?</label>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setAccessMode('anyone')}
                    className={`w-full flex items-center gap-3 text-left px-3.5 py-3 rounded-xl border transition-colors ${
                      accessMode === 'anyone' ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/40'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${accessMode === 'anyone' ? 'border-accent' : 'border-border'}`}>
                      {accessMode === 'anyone' && <span className="w-2 h-2 rounded-full bg-accent" />}
                    </span>
                    <span className="text-sm text-text-primary font-medium">Anyone with the link</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccessMode('invited')}
                    className={`w-full flex items-center gap-3 text-left px-3.5 py-3 rounded-xl border transition-colors ${
                      accessMode === 'invited' ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/40'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${accessMode === 'invited' ? 'border-accent' : 'border-border'}`}>
                      {accessMode === 'invited' && <span className="w-2 h-2 rounded-full bg-accent" />}
                    </span>
                    <span className="text-sm text-text-primary font-medium">Only invited people</span>
                  </button>
                </div>
                {accessMode === 'invited' && (
                  <div className="mt-3">
                    <EmailTagInput emails={invitedEmails} onChange={setInvitedEmails} />
                  </div>
                )}
              </div>

              <label className="flex items-center justify-between cursor-pointer select-none">
                <span className="text-sm text-text-primary font-medium">Email notifications</span>
                <button
                  type="button"
                  onClick={() => setNotifyOnUpload((v) => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${notifyOnUpload ? 'bg-accent' : 'bg-border'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${notifyOnUpload ? 'translate-x-4' : ''}`} />
                </button>
              </label>
              <p className="text-[11px] text-muted -mt-3">Get notified when files are uploaded.</p>

              <div>
                <label className="text-sm font-medium text-text-primary block mb-1.5">Message to uploader (optional)</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_CHARS))}
                  rows={2}
                  maxLength={MAX_MESSAGE_CHARS}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60 resize-none"
                />
                <div className="text-right text-[11px] text-muted mt-1">{message.length}/{MAX_MESSAGE_CHARS}</div>
              </div>

              <button
                onClick={() => setStep('review')}
                disabled={requestTitle.trim().length === 0 || (accessMode === 'invited' && invitedEmails.length === 0)}
                className="w-full bg-gradient-to-r from-accent to-[#7C3AED] text-white font-bold py-3.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3 — review */}
      {step === 'review' && (
        <div className="max-w-md mx-auto space-y-4">
          <button
            onClick={() => setStep('options')}
            className="flex items-center gap-1.5 text-sm text-muted hover:text-text-primary transition-colors"
          >
            ← Back
          </button>
          <div className="border border-border rounded-2xl overflow-hidden shadow-sm bg-card">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-sm font-semibold text-text-primary">Review your request</span>
              <button onClick={() => setStep('options')} className="text-xs font-semibold text-accent hover:underline">Edit</button>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3 bg-bg border border-border rounded-lg px-3.5 py-3">
                <div className="w-10 h-10 rounded-xl bg-yellow-500/15 text-yellow-500 flex items-center justify-center flex-shrink-0">
                  <FolderIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-text-primary truncate">{requestTitle || 'Untitled request'}</div>
                  <div className="text-xs text-muted">Any file type</div>
                </div>
              </div>

              <div className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted">Allow up to</span>
                  <span className="text-text-primary font-medium">{formatBytes(maxSizeBytes)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Expires in</span>
                  <span className="text-text-primary font-medium">{expiryDays} days</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Who can upload?</span>
                  <span className="text-text-primary font-medium">{accessMode === 'anyone' ? 'Anyone with the link' : `${invitedEmails.length} invited ${invitedEmails.length === 1 ? 'person' : 'people'}`}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Folder structure</span>
                  <span className="text-text-primary font-medium">Preserve folder structure</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Email notifications</span>
                  <span className="text-text-primary font-medium">{notifyOnUpload ? 'On' : 'Off'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Message to uploader</span>
                  <span className="text-text-primary font-medium">{message.trim() ? 'Yes' : 'No'}</span>
                </div>
              </div>

              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#00C6FF] flex-shrink-0"
                />
                <span className="text-xs text-muted leading-relaxed">
                  By creating a request, you agree to our{' '}
                  <a href="/terms" target="_blank" className="text-accent hover:underline">Terms of Service</a>
                  {' '}and{' '}
                  <a href="/privacy" target="_blank" className="text-accent hover:underline">Privacy Policy</a>.
                </span>
              </label>

              {error && (
                <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">{error}</div>
              )}

              <button
                onClick={handleCreate}
                disabled={!canCreate || creating}
                className="w-full bg-gradient-to-r from-accent to-[#7C3AED] text-white font-bold py-3.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {creating ? 'Creating…' : 'Create Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4 — created + share */}
      {step === 'created' && created && (
        <div className="max-w-md mx-auto">
          <CreatedStep
            requestTitle={requestTitle}
            message={message}
            maxSizeBytes={maxSizeBytes}
            expiryDays={expiryDays}
            accessMode={accessMode}
            link={created.receiveLink}
            requestId={created.requestId}
            onCreateAnother={resetAll}
          />
        </div>
      )}
    </div>
  )
}

function CreatedStep({
  requestTitle, message, maxSizeBytes, expiryDays, accessMode, link, requestId, onCreateAnother,
}: {
  requestTitle: string
  message: string
  maxSizeBytes: number
  expiryDays: number
  accessMode: 'anyone' | 'invited'
  link: string
  requestId: string
  onCreateAnother: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)
  const [tab, setTab] = useState<ShareTab>('share')
  const [moreEmails, setMoreEmails] = useState<string[]>([])
  const [inviting, setInviting] = useState(false)
  const [inviteSent, setInviteSent] = useState(false)
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      `VayuTransfer Request — ${requestTitle}`,
      `Link: ${link}`,
      `Accepts up to: ${formatBytes(maxSizeBytes)}`,
      `Expires in: ${expiryDays} days`,
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'vayutransfer-request.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const sendMoreInvites = async () => {
    if (moreEmails.length === 0 || inviting) return
    setInviting(true)
    try {
      const res = await fetch(`/api/receive-requests/${requestId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: moreEmails }),
      })
      const data = await res.json()
      if (data.success) {
        setInviteSent(true)
        setMoreEmails([])
        setTimeout(() => setInviteSent(false), 3000)
      }
    } finally {
      setInviting(false)
    }
  }

  const emailHref = `mailto:?subject=${encodeURIComponent(`Upload files: ${requestTitle}`)}&body=${encodeURIComponent(`Please upload your files here:\n\n${link}`)}`

  return (
    <div className="space-y-4">
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
          <div className="text-xl font-bold text-text-primary">Your request is ready!</div>
          <div className="text-sm text-muted mt-1">Share the link to collect files</div>
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

        {showShare && <ShareButtons link={link} fileName={requestTitle} size="sm" />}

        <div className="border-t border-border pt-4 grid grid-cols-2 gap-3 text-left">
          <div>
            <div className="text-[11px] text-muted uppercase tracking-wide">Expires in</div>
            <div className="text-sm font-semibold text-text-primary mt-0.5">{expiryDays} days</div>
          </div>
          <div>
            <div className="text-[11px] text-muted uppercase tracking-wide">Accepts up to</div>
            <div className="text-sm font-semibold text-text-primary mt-0.5">{formatBytes(maxSizeBytes)}</div>
          </div>
        </div>
      </div>

      {/* Preview + Share Link / Invite People */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex border-b border-border">
          <button
            onClick={() => setTab('share')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${tab === 'share' ? 'text-accent border-b-2 border-accent' : 'text-muted hover:text-text-primary'}`}
          >
            <ShareIcon className="w-3.5 h-3.5" /> Share Link
          </button>
          <button
            onClick={() => setTab('invite')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${tab === 'invite' ? 'text-accent border-b-2 border-accent' : 'text-muted hover:text-text-primary'}`}
          >
            <MailIcon className="w-3.5 h-3.5" /> Invite People
          </button>
        </div>

        {tab === 'share' ? (
          <div className="p-4">
            {/* Preview of what an uploader sees at /receive/[requestId] */}
            <div className="border border-border rounded-2xl p-5 text-center space-y-3 bg-bg">
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted">
                <div className="w-4 h-4 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
                  <CheckCircleIcon className="w-2.5 h-2.5 text-bg" />
                </div>
                VayuTransfer Request
              </div>
              <div className="w-14 h-14 mx-auto rounded-2xl bg-yellow-500/15 text-yellow-500 flex items-center justify-center">
                <FolderIcon className="w-7 h-7" />
              </div>
              <div>
                <div className="font-bold text-text-primary">{requestTitle || 'Untitled request'}</div>
                {message.trim() && <p className="text-xs text-muted mt-1 leading-relaxed">{message}</p>}
              </div>
              <div className="text-left text-xs text-muted space-y-1.5 max-w-[220px] mx-auto">
                <div className="flex items-center gap-1.5"><PackageIcon className="w-3.5 h-3.5 flex-shrink-0" /> Accepts up to {formatBytes(maxSizeBytes)}</div>
                <div className="flex items-center gap-1.5"><InboxIcon className="w-3.5 h-3.5 flex-shrink-0" /> {accessMode === 'anyone' ? 'Anyone with the link can upload' : 'Only invited people can upload'}</div>
                <div className="flex items-center gap-1.5"><ChevronDownIcon className="w-3.5 h-3.5 flex-shrink-0 rotate-180" /> Expires in {expiryDays} days</div>
              </div>
              <div className="w-full bg-gradient-to-r from-accent to-[#7C3AED] text-white text-sm font-bold py-2.5 rounded-xl opacity-90">
                Upload Files
              </div>
              <div className="text-[10px] text-muted">vayutransfer.com</div>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <p className="text-xs text-muted">Send this request directly to more people by email.</p>
            <EmailTagInput emails={moreEmails} onChange={setMoreEmails} />
            <button
              onClick={sendMoreInvites}
              disabled={moreEmails.length === 0 || inviting}
              className="w-full bg-accent text-bg font-semibold text-sm rounded-lg py-2.5 hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {inviting ? 'Sending…' : inviteSent ? 'Invites sent!' : 'Send Invites'}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
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
            <img src={qrDataUrl} alt="QR code for the request link" className="w-60 h-60" />
            <button onClick={() => setShowQr(false)} className="flex items-center justify-center gap-1.5 mx-auto text-sm text-gray-600 hover:text-gray-900">
              <CloseIcon className="w-4 h-4" /> Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
