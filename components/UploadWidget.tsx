'use client'

import { useState } from 'react'
import { useUpload, type ActiveUpload } from '@/lib/upload-context'

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

  const shareOptions = upload.shareableLink
    ? [
        {
          label: 'Gmail',
          color: '#EA4335',
          href: `mailto:?subject=${encodeURIComponent(`File ready: ${upload.fileName}`)}&body=${encodeURIComponent(`Here's your download link:\n\n${upload.shareableLink}\n\nLink expires in 24 hours.`)}`,
          icon: (
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
              <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L12 9.548l8.073-6.055C21.69 2.28 24 3.434 24 5.457z"/>
            </svg>
          ),
        },
        {
          label: 'WhatsApp',
          color: '#25D366',
          href: `https://wa.me/?text=${encodeURIComponent(`Here's your download link: ${upload.shareableLink}\n\nExpires in 24 hours.`)}`,
          icon: (
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
            </svg>
          ),
        },
        {
          label: 'Message',
          color: '#00C6FF',
          href: `sms:?body=${encodeURIComponent(`Download link: ${upload.shareableLink} (expires in 24 hours)`)}`,
          icon: (
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          ),
        },
      ]
    : []

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
          {showShare && (
            <div className="flex gap-2">
              {shareOptions.map(opt => (
                <a
                  key={opt.label}
                  href={opt.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border border-border hover:border-current transition-colors text-xs font-medium"
                  style={{ color: opt.color }}
                >
                  {opt.icon}
                  {opt.label}
                </a>
              ))}
            </div>
          )}
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

  // Show only minimized uploads (full-screen ones are handled by the page)
  const visible = uploads.filter(u => u.minimized || u.status === 'done' || u.status === 'failed')

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
