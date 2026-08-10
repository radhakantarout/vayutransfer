'use client'

import { useState, useEffect } from 'react'
import { FileTypeIcon, PackageIcon, ClockIcon, LockIcon, AlertCircleIcon, EyeIcon, DownloadIcon } from '@/components/icons'

interface Props {
  fileId: string
}

interface BatchFileInfo {
  fileId: string
  fileName: string
  relativePath?: string
  fileSizeBytes: number
}

interface BatchFileUrl extends BatchFileInfo {
  downloadUrl: string
}

type State = 'loading' | 'ready' | 'expired' | 'exhausted' | 'error'

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatCountdown(expiryTime: string): string {
  const ms = new Date(expiryTime).getTime() - Date.now()
  if (ms <= 0) return 'Expired'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h > 0) return `${h}h ${m}m remaining`
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}m ${s}s remaining`
}

// Triggers a raw browser save without opening/navigating the current tab —
// safe to call once per file even inside a loop (no popup-blocker issue
// since it's not window.open).
function triggerDownload(url: string, fileName: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export default function DownloadCard({ fileId }: Props) {
  const [state, setState] = useState<State>('loading')
  const [fileName, setFileName] = useState('')
  const [fileSizeBytes, setFileSizeBytes] = useState(0)
  const [expiryTime, setExpiryTime] = useState('')
  const [countdown, setCountdown] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [batchFiles, setBatchFiles] = useState<BatchFileInfo[] | null>(null)
  const [fetchedUrls, setFetchedUrls] = useState<Map<string, string> | null>(null)
  const [previewLoading, setPreviewLoading] = useState<string | null>(null)

  // On mount: GET = info only, no counter increment
  useEffect(() => {
    fetch(`/api/download/${fileId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setFileName(data.data.fileName)
          setFileSizeBytes(data.data.fileSizeBytes)
          setExpiryTime(data.data.expiryTime)
          if (data.data.fileCount) setBatchFiles(data.data.files ?? [])
          setState('ready')
        } else {
          if (data.error === 'LINK_EXPIRED') setState('expired')
          else if (data.error === 'DOWNLOAD_LIMIT_REACHED') setState('exhausted')
          else { setState('error'); setErrorMsg(data.message ?? 'Something went wrong') }
        }
      })
      .catch(() => { setState('error'); setErrorMsg('Network error') })
  }, [fileId])

  // Live countdown timer
  useEffect(() => {
    if (!expiryTime) return
    const tick = () => setCountdown(formatCountdown(expiryTime))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiryTime])

  // The single shared-slot-consuming call. Batch transfers get every file's
  // URL back at once — one slot pays for the whole selection, individual
  // file clicks afterwards just reuse the cached URLs (no extra cost).
  const fetchDownloadUrls = async (): Promise<{ downloadUrl?: string; files?: BatchFileUrl[] } | null> => {
    const res = await fetch(`/api/download/${fileId}`, { method: 'POST' })
    const data = await res.json()
    if (!data.success) {
      if (data.error === 'LINK_EXPIRED') setState('expired')
      else if (data.error === 'DOWNLOAD_LIMIT_REACHED') setState('exhausted')
      else setErrorMsg(data.message ?? 'Download failed')
      return null
    }
    if (data.data.files) {
      const map = new Map<string, string>()
      for (const f of data.data.files as BatchFileUrl[]) map.set(f.fileId, f.downloadUrl)
      setFetchedUrls(map)
    }
    return data.data
  }

  // Single-file transfer
  const handleDownload = async () => {
    setDownloading(true)
    try {
      const data = await fetchDownloadUrls()
      if (data?.downloadUrl) window.open(data.downloadUrl, '_blank')
    } catch {
      setErrorMsg('Network error — please try again')
    } finally {
      setDownloading(false)
    }
  }

  // Batch: "Download all" or an individual file row. Fetches the shared
  // URL set once (if not already cached this session) then triggers saves.
  const handleBatchDownload = async (only?: string) => {
    setDownloading(true)
    try {
      let urls = fetchedUrls
      if (!urls) {
        const data = await fetchDownloadUrls()
        urls = fetchedUrls ?? (data?.files ? new Map(data.files.map((f) => [f.fileId, f.downloadUrl])) : null)
      }
      if (!urls || !batchFiles) return
      const targets = only ? batchFiles.filter((f) => f.fileId === only) : batchFiles
      targets.forEach((f, i) => {
        const url = urls!.get(f.fileId)
        if (url) setTimeout(() => triggerDownload(url, f.fileName), i * 200)
      })
    } catch {
      setErrorMsg('Network error — please try again')
    } finally {
      setDownloading(false)
    }
  }

  const handlePreview = async (targetFileId: string) => {
    setPreviewLoading(targetFileId)
    try {
      const res = await fetch(`/api/download/${fileId}/preview/${targetFileId}`)
      const data = await res.json()
      if (data.success) window.open(data.data.previewUrl, '_blank')
      else setErrorMsg(data.message ?? 'Preview not available for this file')
    } catch {
      setErrorMsg('Network error — please try again')
    } finally {
      setPreviewLoading(null)
    }
  }

  if (state === 'loading') {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-3">
        <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
        <div className="text-muted text-sm">Loading file info...</div>
      </div>
    )
  }

  if (state === 'expired') {
    return (
      <div className="bg-card border border-danger/40 rounded-2xl p-8 text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-danger/10 text-danger flex items-center justify-center">
          <ClockIcon className="w-7 h-7" />
        </div>
        <div className="text-danger font-semibold text-lg">Link Expired</div>
        <div className="text-muted text-sm">This download link has expired and is no longer available.</div>
      </div>
    )
  }

  if (state === 'exhausted') {
    return (
      <div className="bg-card border border-danger/40 rounded-2xl p-8 text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-danger/10 text-danger flex items-center justify-center">
          <LockIcon className="w-7 h-7" />
        </div>
        <div className="text-danger font-semibold text-lg">Download Limit Reached</div>
        <div className="text-muted text-sm">
          This link has reached its download limit.
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="bg-card border border-danger/40 rounded-2xl p-8 text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-danger/10 text-danger flex items-center justify-center">
          <AlertCircleIcon className="w-7 h-7" />
        </div>
        <div className="text-danger font-semibold text-lg">File Not Available</div>
        <div className="text-muted text-sm">{errorMsg}</div>
      </div>
    )
  }

  const isBatch = batchFiles !== null

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="p-8 space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
            {isBatch ? <PackageIcon className="w-7 h-7" /> : <FileTypeIcon fileName={fileName} className="w-7 h-7" />}
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-text-primary text-xl leading-tight break-all">{fileName}</h2>
            <div className="text-muted text-sm mt-1">{formatBytes(fileSizeBytes)}</div>
          </div>
        </div>

        {isBatch && batchFiles.length > 0 && (
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="max-h-64 overflow-y-auto divide-y divide-border">
              {batchFiles.map((f) => (
                <div key={f.fileId} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-8 h-8 rounded-lg bg-bg text-muted flex items-center justify-center flex-shrink-0">
                    <FileTypeIcon fileName={f.fileName} className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-primary truncate">{f.relativePath || f.fileName}</div>
                    <div className="text-xs text-muted">{formatBytes(f.fileSizeBytes)}</div>
                  </div>
                  <button
                    onClick={() => handlePreview(f.fileId)}
                    disabled={previewLoading === f.fileId}
                    className="text-muted hover:text-accent transition-colors p-1.5 flex-shrink-0 disabled:opacity-50"
                    title="Preview"
                  >
                    <EyeIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleBatchDownload(f.fileId)}
                    disabled={downloading}
                    className="text-xs font-medium text-accent hover:underline px-2 py-1 flex-shrink-0 disabled:opacity-50"
                  >
                    Download
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-bg border border-border rounded-xl p-4 flex items-center gap-3">
          <ClockIcon className="w-4 h-4 text-muted flex-shrink-0" />
          <div>
            <div className="text-xs text-muted">Expires in</div>
            <div className="font-bold text-sm text-text-primary leading-tight">{countdown}</div>
          </div>
        </div>

        {errorMsg && (
          <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">
            {errorMsg}
          </div>
        )}

        <button
          onClick={isBatch ? () => handleBatchDownload() : handleDownload}
          disabled={downloading}
          className="w-full bg-accent text-bg font-bold py-4 rounded-xl text-lg hover:bg-accent/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <DownloadIcon className="w-5 h-5" />
          {downloading ? 'Preparing download...' : isBatch ? `Download All (${batchFiles?.length ?? 0} files)` : 'Download File'}
        </button>
      </div>

      <div className="border-t border-border px-8 py-4 bg-bg/50">
        <p className="text-xs text-muted text-center">
          Shared via <span className="text-accent font-medium">VayuTransfer</span> · Secure. Prepaid. No surprises.
        </p>
      </div>
    </div>
  )
}
