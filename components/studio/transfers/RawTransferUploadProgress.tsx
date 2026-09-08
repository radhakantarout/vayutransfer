'use client'

// "Uploading your files..." step — per-file status list + combined stats,
// mirroring VayuTransfer's own multi-file progress panel. A failed file
// never blocks the rest of the batch (same principle VayuTransfer's own
// batch upload follows) — it just gets its own inline Retry button.

import { useEffect, useMemo, useState } from 'react'
import type { UploadItem } from './useBatchSend'
import { fmtBytes, fmtEta } from './transferUtils'

interface Props {
  items: UploadItem[]
  startedAt: number | null
  shareUrl: string | null
  onRetry: (id: string) => void
  onCancel: () => void
}

export default function RawTransferUploadProgress({ items, startedAt, shareUrl, onRetry, onCancel }: Props) {
  const [, forceTick] = useState(0)
  const [copied, setCopied] = useState(false)
  // Re-render every second purely to keep the speed/ETA numbers live — byte
  // updates already trigger re-renders, this just covers the gaps between them.
  useEffect(() => {
    const t = setInterval(() => forceTick(v => v + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const stats = useMemo(() => {
    const totalBytes = items.reduce((sum, i) => sum + i.file.size, 0)
    const uploadedBytes = items.reduce((sum, i) => sum + (i.status === 'done' ? i.file.size : i.uploadedBytes), 0)
    const percent = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0
    const doneCount = items.filter(i => i.status === 'done').length
    const elapsedSec = startedAt ? Math.max((Date.now() - startedAt) / 1000, 0.001) : 0.001
    const speedBps = uploadedBytes / elapsedSec
    const etaSeconds = speedBps > 0 ? Math.max(totalBytes - uploadedBytes, 0) / speedBps : 0
    const anyFailed = items.some(i => i.status === 'failed')
    const anyActive = items.some(i => i.status === 'queued' || i.status === 'uploading')
    return { totalBytes, uploadedBytes, percent, doneCount, speedBps, etaSeconds, anyFailed, anyActive }
  }, [items, startedAt])

  return (
    <div className="max-w-lg mx-auto bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-text-primary">
          {stats.anyActive ? 'Uploading your files…' : stats.anyFailed ? 'Finished with some failures' : 'Upload complete'}
        </h2>
        <span className="text-lg font-bold text-accent">{stats.percent}%</span>
      </div>
      <p className="text-xs text-muted -mt-2">
        {fmtBytes(stats.uploadedBytes)} of {fmtBytes(stats.totalBytes)} · {stats.anyActive ? fmtEta(stats.etaSeconds) : `${stats.doneCount}/${items.length} done`}
      </p>

      <div className="w-full h-2 bg-bg border border-border rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-accent to-[#7C3AED] transition-all duration-150" style={{ width: `${stats.percent}%` }} />
      </div>

      {shareUrl && !stats.anyActive && !stats.anyFailed && (
        <div className="flex items-center gap-2">
          <input readOnly value={shareUrl} className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text-primary" />
          <button
            onClick={() => { navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
            className="flex-shrink-0 bg-accent text-bg text-xs font-bold px-3 py-2 rounded-lg hover:bg-accent/90 transition-colors">
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-bg border border-border rounded-xl px-2 py-2 text-center">
          <div className="text-sm font-bold text-text-primary">{fmtBytes(stats.speedBps)}/s</div>
          <div className="text-[10px] text-muted">Upload speed</div>
        </div>
        <div className="bg-bg border border-border rounded-xl px-2 py-2 text-center">
          <div className="text-sm font-bold text-text-primary">{stats.anyActive ? fmtEta(stats.etaSeconds) : '—'}</div>
          <div className="text-[10px] text-muted">Time left</div>
        </div>
        <div className="bg-bg border border-border rounded-xl px-2 py-2 text-center">
          <div className="text-sm font-bold text-text-primary">{stats.doneCount}/{items.length}</div>
          <div className="text-[10px] text-muted">Items</div>
        </div>
      </div>

      <div className="space-y-1 max-h-[280px] overflow-y-auto">
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
            <span className="flex-1 min-w-0 text-xs text-text-primary truncate">{item.relativePath}</span>
            <span className="text-[11px] text-muted flex-shrink-0">{fmtBytes(item.file.size)}</span>
            {item.status === 'done' && (
              <svg className="w-4 h-4 text-success flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {(item.status === 'queued' || item.status === 'uploading') && (
              <div className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
            )}
            {item.status === 'failed' && (
              <button onClick={() => onRetry(item.id)} title={item.error}
                className="text-[11px] font-bold text-danger hover:underline flex-shrink-0">
                Retry
              </button>
            )}
          </div>
        ))}
      </div>

      {stats.anyActive && (
        <button onClick={onCancel}
          className="w-full border border-danger/30 text-danger text-sm font-semibold py-2 rounded-xl hover:bg-danger/10 transition-colors">
          Cancel Transfer
        </button>
      )}
    </div>
  )
}
