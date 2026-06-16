'use client'

import { useState } from 'react'

interface Props {
  percent: number
  currentChunk: number
  totalChunks: number
  fileName: string
  shareableLink?: string
  onAbort: () => void
}

export default function UploadProgress({
  percent,
  currentChunk,
  totalChunks,
  fileName,
  shareableLink,
  onAbort,
}: Props) {
  const [copied, setCopied] = useState(false)

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
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-text-primary text-sm truncate max-w-xs">{fileName}</div>
          <div className="text-muted text-xs mt-1">
            {totalChunks > 1
              ? `Uploading chunk ${currentChunk} of ${totalChunks}`
              : 'Uploading...'}
          </div>
        </div>
        <div className="text-accent font-bold text-lg">{percent}%</div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-bg rounded-full h-2 overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>

      <button
        onClick={onAbort}
        className="text-danger text-sm hover:underline transition-colors"
      >
        Cancel & refund
      </button>
    </div>
  )
}
