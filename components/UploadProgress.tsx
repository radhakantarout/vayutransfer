'use client'

import { useState } from 'react'
import Image from 'next/image'
import { MULTIPART_CHUNK_SIZE_BYTES } from '@/constants/pricing'

interface Props {
  percent: number
  currentChunk: number
  totalChunks: number
  fileSizeBytes: number
  fileName: string
  speedBytesPerSec: number
  secondsRemaining: number
  shareableLink?: string
  error?: string | null
  onAbort: () => void
  onMinimize?: () => void
}

function formatSpeed(bps: number): string {
  if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`
  return `${bps.toFixed(0)} B/s`
}

function formatTime(secs: number): string {
  if (!isFinite(secs) || secs <= 0) return 'Calculating…'
  if (secs < 60) return `${Math.round(secs)}s remaining`
  if (secs < 3600) return `${Math.round(secs / 60)} min remaining`
  return `${(secs / 3600).toFixed(1)}h remaining`
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

const shareOptions = (link: string, name: string) => [
  {
    label: 'Gmail',
    color: '#EA4335',
    href: `mailto:?subject=${encodeURIComponent(`File ready: ${name}`)}&body=${encodeURIComponent(`Here's your download link:\n\n${link}\n\nLink expires in 24 hours.`)}`,
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L12 9.548l8.073-6.055C21.69 2.28 24 3.434 24 5.457z"/>
      </svg>
    ),
  },
  {
    label: 'WhatsApp',
    color: '#25D366',
    href: `https://wa.me/?text=${encodeURIComponent(`Here's your download link: ${link}\n\nExpires in 24 hours.`)}`,
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
      </svg>
    ),
  },
  {
    label: 'Message',
    color: '#00C6FF',
    href: `sms:?body=${encodeURIComponent(`Download link: ${link} (expires in 24 hours)`)}`,
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
]

export default function UploadProgress({
  percent,
  currentChunk,
  totalChunks,
  fileSizeBytes,
  fileName,
  speedBytesPerSec,
  secondsRemaining,
  shareableLink,
  error,
  onAbort,
  onMinimize,
}: Props) {
  const [copied, setCopied] = useState(false)
  const [showShare, setShowShare] = useState(false)

  const copyLink = async () => {
    if (!shareableLink) return
    await navigator.clipboard.writeText(shareableLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (shareableLink) {
    const options = shareOptions(shareableLink, fileName)
    return (
      <div className="bg-card border border-success/40 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <div className="font-semibold text-success">Upload complete!</div>
            <div className="text-muted text-sm truncate max-w-xs">{fileName}</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm text-muted">Shareable link</div>
          <div className="flex gap-2">
            <input
              readOnly
              value={shareableLink}
              className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary font-mono truncate focus:outline-none focus:border-accent"
            />
            <button
              onClick={copyLink}
              className="px-4 py-2 bg-accent text-bg font-semibold rounded-lg text-sm hover:bg-accent/90 transition-colors whitespace-nowrap"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={() => setShowShare((v) => !v)}
              title="Share"
              className={`px-3 py-2 border rounded-lg text-sm transition-colors ${showShare ? 'bg-accent/10 border-accent text-accent' : 'border-border text-muted hover:border-accent hover:text-accent'}`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>
          </div>
        </div>

        {showShare && (
          <div className="flex gap-3 pt-1">
            {options.map((opt) => (
              <a
                key={opt.label}
                href={opt.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border border-border hover:border-current transition-colors text-xs font-medium"
                style={{ color: opt.color }}
              >
                {opt.icon}
                {opt.label}
              </a>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-card border border-danger/40 rounded-xl p-6 space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">❌</span>
          <div>
            <div className="font-semibold text-danger">Upload failed</div>
            <div className="text-muted text-sm truncate max-w-xs">{fileName}</div>
          </div>
        </div>
        <div className="text-sm text-danger/80 bg-danger/10 rounded-lg px-3 py-2">{error}</div>
      </div>
    )
  }

  // r=52, circumference = 2π×52 ≈ 326.73
  const circumference = 326.73
  const strokeOffset = circumference * (1 - percent / 100)

  return (
    <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center gap-5 relative">
      {/* Minimize button — top-right */}
      {onMinimize && (
        <button
          onClick={onMinimize}
          title="Minimize — upload continues in background"
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full border border-border text-muted hover:border-accent hover:text-accent transition-colors text-sm"
        >
          −
        </button>
      )}
      {/* Circular progress ring with logo */}
      <div className="relative w-44 h-44">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          {/* Track */}
          <circle
            cx="60" cy="60" r="52"
            fill="none" stroke="currentColor" strokeWidth="7"
            className="text-border"
          />
          {/* Progress arc */}
          <circle
            cx="60" cy="60" r="52"
            fill="none" stroke="currentColor" strokeWidth="7"
            strokeLinecap="round"
            className="text-accent transition-all duration-300"
            strokeDasharray={circumference}
            strokeDashoffset={strokeOffset}
          />
        </svg>

        {/* Logo + percent centered inside ring */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <Image
            src="/logo.png"
            alt="VayuTransfer"
            width={100}
            height={40}
            className="h-8 w-auto"
          />
          <span className="text-accent font-bold text-xl tabular-nums">{percent}%</span>
        </div>
      </div>

      {/* File info */}
      <div className="text-center space-y-1">
        <div className="text-sm font-medium text-text-primary truncate max-w-xs">{fileName}</div>
        <div className="text-xs text-muted">
          ↑ {formatBytes(Math.min(currentChunk * MULTIPART_CHUNK_SIZE_BYTES, fileSizeBytes))} / {formatBytes(fileSizeBytes)} · {formatTime(secondsRemaining)}
        </div>
        {speedBytesPerSec > 0 && (
          <div className="text-xs text-accent font-medium">{formatSpeed(speedBytesPerSec)}</div>
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        <button
          onClick={onAbort}
          className="text-danger text-sm hover:underline transition-colors"
        >
          Cancel & refund
        </button>
        {onMinimize && (
          <button
            onClick={onMinimize}
            className="text-muted text-xs hover:text-accent transition-colors"
          >
            Minimize → explore or upload another file
          </button>
        )}
      </div>
    </div>
  )
}
