'use client'

import { useState } from 'react'
import { useUpload, type ActiveUpload } from '@/lib/upload-context'
import ShareButtons from '@/components/ShareButtons'

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function fmtSpeed(bps: number): string {
  if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`
  return `${bps.toFixed(0)} B/s`
}

function fmtTime(secs: number): string {
  if (!isFinite(secs) || secs <= 0) return 'calculating…'
  if (secs < 60) return `${Math.round(secs)}s`
  if (secs < 3600) return `${Math.round(secs / 60)} min`
  return `${(secs / 3600).toFixed(1)}h`
}

function UploadCard({
  upload,
  onAbort,
  onDismiss,
}: {
  upload: ActiveUpload
  onAbort: () => void
  onDismiss: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [showShare, setShowShare] = useState(false)

  const copyLink = async () => {
    if (!upload.shareableLink) return
    await navigator.clipboard.writeText(upload.shareableLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }


  return (
    <div className="px-4 py-3 space-y-2">
      {/* File name row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base flex-shrink-0">
            {upload.status === 'done' ? '✅' : upload.status === 'failed' ? '❌' : '⬆️'}
          </span>
          <span className="text-xs font-medium text-text-primary truncate">{upload.fileName}</span>
        </div>
        <button
          onClick={onDismiss}
          title="Dismiss"
          className="flex-shrink-0 text-muted hover:text-danger transition-colors text-base leading-none"
        >
          ×
        </button>
      </div>

      {upload.status === 'uploading' && (
        <>
          {/* Progress bar */}
          <div className="w-full bg-bg rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{ width: `${upload.percent}%` }}
            />
          </div>

          {/* Stats row */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">
              {fmtBytes(upload.uploadedBytes)} / {fmtBytes(upload.totalBytes)}
              {upload.secondsRemaining > 0 && isFinite(upload.secondsRemaining) && (
                <span className="ml-1">· {fmtTime(upload.secondsRemaining)} left</span>
              )}
            </span>
            {upload.speedBytesPerSec > 0 && (
              <span className="text-accent font-semibold">{fmtSpeed(upload.speedBytesPerSec)}</span>
            )}
          </div>

          <button
            onClick={onAbort}
            className="text-danger text-xs hover:underline"
          >
            Cancel & refund
          </button>
        </>
      )}

      {upload.status === 'done' && upload.shareableLink && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button
              onClick={copyLink}
              className="flex-1 text-xs bg-success/10 hover:bg-success/20 border border-success/30 text-success font-semibold py-1.5 rounded-lg transition-colors"
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>
            <button
              onClick={() => setShowShare(v => !v)}
              title="Share"
              className={`px-2.5 py-1.5 border rounded-lg text-xs transition-colors ${showShare ? 'bg-accent/10 border-accent text-accent' : 'border-border text-muted hover:border-accent hover:text-accent'}`}
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>
          </div>
          {showShare && <ShareButtons link={upload.shareableLink} fileName={upload.fileName} size="sm" />}
        </div>
      )}

      {upload.status === 'failed' && (
        <div className="text-xs text-danger/80">{upload.error ?? 'Upload failed'}</div>
      )}
    </div>
  )
}

export default function UploadWidget() {
  const { uploads, abortUpload, dismissUpload } = useUpload()
  const [collapsed, setCollapsed] = useState(false)

  // Only show uploads the user has explicitly minimized — done/failed non-minimized ones stay on the page
  const visible = uploads.filter(u => u.minimized)

  if (visible.length === 0) return null

  const inProgress = visible.filter(u => u.status === 'uploading').length

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 rounded-xl shadow-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-nav cursor-pointer select-none"
        onClick={() => setCollapsed(v => !v)}
      >
        <div className="flex items-center gap-2">
          {inProgress > 0 && (
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse flex-shrink-0" />
          )}
          <span className="text-sm font-semibold text-white">
            {inProgress > 0
              ? `Uploading ${inProgress} file${inProgress > 1 ? 's' : ''}…`
              : `${visible.length} upload${visible.length > 1 ? 's' : ''} done`}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-muted transition-transform ${collapsed ? '' : 'rotate-180'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Cards */}
      {!collapsed && (
        <div className="divide-y divide-border max-h-96 overflow-y-auto">
          {visible.map(upload => (
            <UploadCard
              key={upload.id}
              upload={upload}
              onAbort={() => abortUpload(upload.id)}
              onDismiss={() => dismissUpload(upload.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
