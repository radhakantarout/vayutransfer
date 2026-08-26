'use client'

import { FileTypeIcon, fileTypeColor, CheckCircleIcon, ClockIcon, RefreshIcon } from '@/components/icons'
import FolderTree from '@/components/FolderTree'
import { buildFileTree } from '@/lib/fileTree'
import type { BatchFileProgress } from '@/lib/upload-context'

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

interface Props {
  title?: string
  percent: number
  uploadedBytes: number
  totalBytes: number
  speedBytesPerSec: number
  secondsRemaining: number
  batchFiles: BatchFileProgress[]
  onRetryFile?: (fileId: string) => void
}

// Shared by the normal Send flow (TransferFlow.tsx's UploadingStep) and the
// resume-by-reselect page (/transfer/resume/[fileId]) — from the user's
// point of view an upload in progress should look identical regardless of
// whether it's a fresh send or picking a paused one back up, so this is
// the one place that layout is defined.
export default function UploadProgressPanel({
  title = 'Uploading your files...', percent, uploadedBytes, totalBytes, speedBytesPerSec, secondsRemaining, batchFiles, onRetryFile,
}: Props) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-text-primary">{title}</div>
        <div className="text-lg font-bold text-accent tabular-nums">{percent}%</div>
      </div>
      <div className="text-xs text-muted -mt-3">
        {formatBytes(uploadedBytes)} of {formatBytes(totalBytes)} · {formatTime(secondsRemaining)}
      </div>

      <div className="w-full bg-bg rounded-full h-2 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-accent to-[#7C3AED] rounded-full transition-all duration-300" style={{ width: `${percent}%` }} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-bg border border-border rounded-xl px-3 py-2.5 text-center">
          <div className="text-sm font-bold text-text-primary tabular-nums">{speedBytesPerSec > 0 ? formatSpeed(speedBytesPerSec) : '—'}</div>
          <div className="text-[11px] text-muted">Upload speed</div>
        </div>
        <div className="bg-bg border border-border rounded-xl px-3 py-2.5 text-center">
          <div className="text-sm font-bold text-text-primary tabular-nums">{formatTime(secondsRemaining).replace(' left', '')}</div>
          <div className="text-[11px] text-muted">Time left</div>
        </div>
        <div className="bg-bg border border-border rounded-xl px-3 py-2.5 text-center">
          <div className="text-sm font-bold text-text-primary tabular-nums">
            {batchFiles.length > 0 ? `${batchFiles.filter((f) => f.status === 'done' || f.status === 'skipped').length}/${batchFiles.length}` : `${Math.round(percent)}%`}
          </div>
          <div className="text-[11px] text-muted">Items</div>
        </div>
      </div>

      {batchFiles.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="max-h-64 overflow-y-auto divide-y divide-border">
            <FolderTree
              tree={buildFileTree(batchFiles, (f) => f.path)}
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
                  {f.status === 'failed' && onRetryFile && (
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
    </div>
  )
}
