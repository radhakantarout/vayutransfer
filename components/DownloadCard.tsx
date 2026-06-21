'use client'

import { useState, useEffect } from 'react'

interface Props {
  fileId: string
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

export default function DownloadCard({ fileId }: Props) {
  const [state, setState] = useState<State>('loading')
  const [fileName, setFileName] = useState('')
  const [fileSizeBytes, setFileSizeBytes] = useState(0)
  const [downloadsRemaining, setDownloadsRemaining] = useState(0)
  const [downloadSlots, setDownloadSlots] = useState(0)
  const [expiryTime, setExpiryTime] = useState('')
  const [countdown, setCountdown] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [downloading, setDownloading] = useState(false)

  // On mount: GET = info only, no counter increment
  useEffect(() => {
    fetch(`/api/download/${fileId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setFileName(data.data.fileName)
          setFileSizeBytes(data.data.fileSizeBytes)
          setDownloadsRemaining(data.data.downloadsRemaining)
          setDownloadSlots(data.data.downloadSlots)
          setExpiryTime(data.data.expiryTime)
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

  // On button click: POST = increment counter + get presigned URL
  const handleDownload = async () => {
    setDownloading(true)
    try {
      const res = await fetch(`/api/download/${fileId}`, { method: 'POST' })
      const data = await res.json()

      if (data.success) {
        window.open(data.data.downloadUrl, '_blank')
        // Update remaining count
        setDownloadsRemaining(data.data.downloadsRemaining)
        if (data.data.downloadsRemaining <= 0) {
          setState('exhausted')
        }
      } else {
        if (data.error === 'LINK_EXPIRED') setState('expired')
        else if (data.error === 'DOWNLOAD_LIMIT_REACHED') setState('exhausted')
        else setErrorMsg(data.message ?? 'Download failed')
      }
    } catch {
      setErrorMsg('Network error — please try again')
    } finally {
      setDownloading(false)
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
        <div className="text-5xl">⏰</div>
        <div className="text-danger font-semibold text-lg">Link Expired</div>
        <div className="text-muted text-sm">This download link has expired and is no longer available.</div>
      </div>
    )
  }

  if (state === 'exhausted') {
    return (
      <div className="bg-card border border-danger/40 rounded-2xl p-8 text-center space-y-3">
        <div className="text-5xl">🔒</div>
        <div className="text-danger font-semibold text-lg">Download Limit Reached</div>
        <div className="text-muted text-sm">
          All {downloadSlots} allowed download{downloadSlots !== 1 ? 's' : ''} have been used.
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="bg-card border border-danger/40 rounded-2xl p-8 text-center space-y-3">
        <div className="text-5xl">❌</div>
        <div className="text-danger font-semibold text-lg">File Not Available</div>
        <div className="text-muted text-sm">{errorMsg}</div>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="p-8 space-y-6">
        <div className="flex items-start gap-4">
          <div className="text-5xl flex-shrink-0">📄</div>
          <div className="min-w-0">
            <h2 className="font-bold text-text-primary text-xl leading-tight break-all">{fileName}</h2>
            <div className="text-muted text-sm mt-1">{formatBytes(fileSizeBytes)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-bg border border-border rounded-xl p-4">
            <div className="text-xs text-muted mb-1">Downloads left</div>
            <div className={`font-bold text-xl ${downloadsRemaining <= 1 ? 'text-danger' : 'text-text-primary'}`}>
              {downloadsRemaining}
            </div>
          </div>
          <div className="bg-bg border border-border rounded-xl p-4">
            <div className="text-xs text-muted mb-1">Expires in</div>
            <div className="font-bold text-sm text-text-primary leading-tight">{countdown}</div>
          </div>
        </div>

        {errorMsg && (
          <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">
            {errorMsg}
          </div>
        )}

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full bg-accent text-bg font-bold py-4 rounded-xl text-lg hover:bg-accent/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {downloading ? 'Preparing download...' : 'Download File'}
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
