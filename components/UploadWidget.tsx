'use client'

import { useState, useRef, useEffect } from 'react'
import { useUpload, type ActiveUpload } from '@/lib/upload-context'
import ShareButtons from '@/components/ShareButtons'
import { SpeedIcon, CheckCircleIcon, AlertCircleIcon, RefreshIcon, CloseIcon, FileTypeIcon, fileTypeColor } from '@/components/icons'

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

// "Today" / "Yesterday" / a real date, for the panel's date-grouped sections.
function dateGroupLabel(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

type Tab = 'all' | 'uploading' | 'completed' | 'failed'

function tabOf(status: ActiveUpload['status']): Tab {
  if (status === 'done') return 'completed'
  if (status === 'failed') return 'failed'
  return 'uploading' // 'uploading' and 'partial' both still need attention
}

function UploadCard({
  upload,
  onAbort,
  onDismiss,
  onRetry,
  onRetryFile,
  onSkipFailed,
}: {
  upload: ActiveUpload
  onAbort: () => void
  onDismiss: () => void
  onRetry: () => void
  onRetryFile: (fileId: string) => void
  onSkipFailed: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showFiles, setShowFiles] = useState(false)
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
  }, [])

  const copyLink = async () => {
    if (!upload.shareableLink) return
    await navigator.clipboard.writeText(upload.shareableLink)
    setCopied(true)
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
    copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="px-4 py-3 space-y-2">
      {/* File name row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base flex-shrink-0">
            {upload.status === 'done' ? '✅' : upload.status === 'failed' ? '❌' : upload.status === 'partial' ? '⚠️' : '⬆️'}
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
              <span className="flex items-center gap-1 text-accent font-semibold">
                <SpeedIcon className="w-3 h-3" />
                {fmtSpeed(upload.speedBytesPerSec)}
              </span>
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

      {upload.status === 'partial' && upload.batchFiles && (
        <div className="space-y-1.5">
          {(() => {
            const failed = upload.batchFiles!.filter((f) => f.status === 'failed')
            const succeeded = upload.batchFiles!.filter((f) => f.status === 'done' || f.status === 'skipped')
            return (
              <>
                <button
                  onClick={() => setShowFiles((v) => !v)}
                  className="text-xs text-yellow-500 hover:underline text-left"
                >
                  {succeeded.length}/{upload.batchFiles!.length} uploaded, {failed.length} failed — {showFiles ? 'hide' : 'review'}
                </button>
                {showFiles && (
                  <div className="max-h-32 overflow-y-auto divide-y divide-border border border-border rounded-lg">
                    {upload.batchFiles!.map((f) => (
                      <div key={f.fileId} className="flex items-center gap-2 px-2 py-1.5">
                        <FileTypeIcon fileName={f.path} className={`w-3 h-3 flex-shrink-0 ${fileTypeColor(f.path)}`} />
                        <span className="flex-1 min-w-0 text-[11px] text-text-primary truncate">{f.path}</span>
                        {f.status === 'done' && <CheckCircleIcon className="w-3 h-3 text-success flex-shrink-0" />}
                        {f.status === 'skipped' && <span className="text-[10px] text-muted flex-shrink-0">Skipped</span>}
                        {f.status === 'uploading' && <span className="w-3 h-3 border-2 border-accent/40 border-t-accent rounded-full animate-spin flex-shrink-0" />}
                        {f.status === 'failed' && (
                          <button onClick={() => onRetryFile(f.fileId)} className="text-[10px] text-accent hover:underline flex-shrink-0">
                            <RefreshIcon className="w-2.5 h-2.5 inline" /> Retry
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={onSkipFailed} disabled={failed.length === 0} className="text-accent text-xs font-semibold hover:underline disabled:opacity-40">
                    Skip failed & finish
                  </button>
                  <button onClick={onAbort} className="text-danger text-xs hover:underline">Cancel & refund all</button>
                </div>
              </>
            )
          })()}
        </div>
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
        <div className="space-y-1.5">
          <div className="text-xs text-danger/80">{upload.error ?? 'Upload failed'} — resumes from where it left off</div>
          <div className="flex gap-3">
            <button onClick={onRetry} className="text-accent text-xs font-semibold hover:underline">Retry</button>
            <button onClick={onAbort} className="text-danger text-xs hover:underline">Cancel & refund</button>
          </div>
        </div>
      )}
    </div>
  )
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'uploading', label: 'Uploading' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
]

export default function UploadWidget() {
  const { uploads, abortUpload, dismissUpload, retryUpload, retryBatchFile, skipBatchFailedFiles } = useUpload()
  const [collapsed, setCollapsed] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [tab, setTab] = useState<Tab>('all')
  const prevIdsRef = useRef<Set<string>>(new Set())

  // Auto-reopens the panel whenever a genuinely new upload starts, even if
  // the user had previously closed it — matches the mockup's "dismissible
  // but auto-reopens on new upload" behavior.
  useEffect(() => {
    const currentIds = new Set(uploads.map((u) => u.id))
    const hasNewUpload = uploads.some((u) => !prevIdsRef.current.has(u.id))
    if (hasNewUpload) setDismissed(false)
    prevIdsRef.current = currentIds
  }, [uploads])

  if (uploads.length === 0 || dismissed) return null

  const filtered = tab === 'all' ? uploads : uploads.filter((u) => tabOf(u.status) === tab)
  const inProgress = uploads.filter((u) => u.status === 'uploading' || u.status === 'partial').length

  // Group by day, newest first within each group.
  const sorted = [...filtered].sort((a, b) => b.createdAt - a.createdAt)
  const groups: { label: string; items: ActiveUpload[] }[] = []
  for (const upload of sorted) {
    const label = dateGroupLabel(upload.createdAt)
    const group = groups.find((g) => g.label === label)
    if (group) group.items.push(upload)
    else groups.push({ label, items: [upload] })
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl shadow-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-nav">
        <div
          className="flex items-center gap-2 cursor-pointer select-none min-w-0"
          onClick={() => setCollapsed((v) => !v)}
        >
          {inProgress > 0 && (
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse flex-shrink-0" />
          )}
          <span className="text-sm font-semibold text-white truncate">
            {inProgress > 0
              ? `Uploading ${inProgress} item${inProgress > 1 ? 's' : ''}…`
              : 'Uploads'}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setCollapsed((v) => !v)} title={collapsed ? 'Expand' : 'Collapse'}>
            <svg
              className={`w-4 h-4 text-muted hover:text-white transition-transform ${collapsed ? '' : 'rotate-180'}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button onClick={() => setDismissed(true)} title="Close" className="text-muted hover:text-white transition-colors">
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Tabs */}
          <div className="flex border-b border-border px-2">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-2.5 py-2 text-xs font-medium border-b-2 transition-colors ${
                  tab === key ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-text-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Cards, grouped by date */}
          <div className="max-h-96 overflow-y-auto">
            {groups.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted">Nothing here</div>
            ) : (
              groups.map((group) => (
                <div key={group.label}>
                  <div className="px-4 pt-2.5 pb-1 text-[11px] font-semibold text-muted uppercase tracking-wide">{group.label}</div>
                  <div className="divide-y divide-border">
                    {group.items.map((upload) => (
                      <UploadCard
                        key={upload.id}
                        upload={upload}
                        onAbort={() => abortUpload(upload.id)}
                        onDismiss={() => dismissUpload(upload.id)}
                        onRetry={() => retryUpload(upload.id)}
                        onRetryFile={(fileId) => retryBatchFile(upload.id, fileId)}
                        onSkipFailed={() => skipBatchFailedFiles(upload.id)}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
