'use client'

import { useState } from 'react'
import Image from 'next/image'
import { MULTIPART_CHUNK_SIZE_BYTES } from '@/constants/pricing'
import ShareButtons from '@/components/ShareButtons'

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

        {showShare && <ShareButtons link={shareableLink} fileName={fileName} />}
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
