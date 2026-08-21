'use client'

import { useState, useEffect, useRef } from 'react'
import { FileTypeIcon, PackageIcon, ClockIcon, LockIcon, AlertCircleIcon, EyeIcon, DownloadIcon } from '@/components/icons'

// File System Access API — Chromium desktop + Android Chrome only (not in
// TypeScript's DOM lib yet as a Window member, unlike the handle
// interfaces it returns, which lib.dom.d.ts already declares).
declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
  }
}

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

type State = 'loading' | 'ready' | 'expired' | 'exhausted' | 'error' | 'password-required'

// Where a batch download actually goes depends on what the browser can do:
// File System Access API (Chromium desktop + Android Chrome) writes every
// file straight to a folder the user picks, preserving relativePath as
// real subfolders — no zip involved, no unzip step for the user
// afterwards. Everywhere else (Safari/iOS entirely, Firefox) falls back
// to the existing zip strategy below, since there's no browser API that
// can write multiple files with folder structure without one.
const SUPPORTS_DIRECTORY_PICKER = typeof window !== 'undefined' && 'showDirectoryPicker' in window

// Below this, zipping in the browser (fetch + JSZip, no server round trip)
// is fast enough and avoids spinning up a Lambda for what's usually a
// handful of files. At/above it, the batch is handed to the dedicated
// vayu-transfer-zip Lambda job — browser memory and a single-threaded zip
// loop don't scale to multi-GB folders the way the streaming server-side
// pipeline does. Mirrors VayuStudios' proven print-portal threshold.
// (Only reached when SUPPORTS_DIRECTORY_PICKER is false — the direct-to-
// folder path above has no such Lambda-timeout ceiling to route around.)
const CLIENT_ZIP_THRESHOLD_BYTES = 1024 * 1024 * 1024 // 1GB

type ZipJobState =
  | { phase: 'idle' }
  | { phase: 'creating'; processed: number; total: number }
  | { phase: 'ready'; downloadUrl: string; filename: string }
  // Direct-to-folder finished — nothing to click, files are already saved.
  | { phase: 'direct-done' }
  | { phase: 'error'; message: string }

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
  const [zipJob, setZipJob] = useState<ZipJobState>({ phase: 'idle' })
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState(false)
  const [verifyingPassword, setVerifyingPassword] = useState(false)
  // The password that actually verified successfully — resent with the
  // real download POST too, since that route re-validates independently
  // rather than trusting this component's local "already verified" state.
  const verifiedPasswordRef = useRef<string | null>(null)
  // Generation counter: guards against a stale poll/zip loop from a
  // previous "Download All" click (or an unmounted component) still
  // running and calling setState after a newer click superseded it.
  const zipGen = useRef(0)

  useEffect(() => {
    return () => { zipGen.current++ }
  }, [])

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
          else if (data.error === 'PASSWORD_REQUIRED') setState('password-required')
          else { setState('error'); setErrorMsg(data.message ?? 'Something went wrong') }
        }
      })
      .catch(() => { setState('error'); setErrorMsg('Network error') })
  }, [fileId])

  const handleVerifyPassword = async () => {
    if (!passwordInput) return
    setVerifyingPassword(true)
    setPasswordError(false)
    try {
      const res = await fetch(`/api/download/${fileId}/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput }),
      })
      const data = await res.json()
      if (!data.success) {
        setPasswordError(true)
        return
      }
      verifiedPasswordRef.current = passwordInput
      setFileName(data.data.fileName)
      setFileSizeBytes(data.data.fileSizeBytes)
      setExpiryTime(data.data.expiryTime)
      if (data.data.fileCount) setBatchFiles(data.data.files ?? [])
      setState('ready')
    } catch {
      setPasswordError(true)
    } finally {
      setVerifyingPassword(false)
    }
  }

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
    const res = await fetch(`/api/download/${fileId}`, {
      method: 'POST',
      ...(verifiedPasswordRef.current && {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: verifiedPasswordRef.current }),
      }),
    })
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

  // A single row's own "Download" click — always just that one file, saved
  // directly, never zipped.
  const handleFileRowDownload = async (only: string) => {
    setDownloading(true)
    try {
      let urls = fetchedUrls
      if (!urls) {
        const data = await fetchDownloadUrls()
        urls = fetchedUrls ?? (data?.files ? new Map(data.files.map((f) => [f.fileId, f.downloadUrl])) : null)
      }
      const url = urls?.get(only)
      const target = batchFiles?.find((f) => f.fileId === only)
      if (url && target) triggerDownload(url, target.fileName)
    } catch {
      setErrorMsg('Network error — please try again')
    } finally {
      setDownloading(false)
    }
  }

  // Small batches: zip entirely in the browser, one save instead of N
  // separate automatic downloads (which Chrome silently throttles/blocks
  // past a handful in a row). relativePath is used as the in-zip path so
  // folder structure from the original upload is preserved.
  const downloadAllClientSide = async (myGen: number) => {
    if (!batchFiles) return
    const data = await fetchDownloadUrls()
    if (myGen !== zipGen.current) return
    const urls = data?.files ? new Map(data.files.map((f) => [f.fileId, f.downloadUrl])) : fetchedUrls
    if (!urls) throw new Error('Could not get download links')

    const zipFilename = `${(fileName || 'files').replace(/[^a-z0-9]+/gi, '-')}.zip`
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    const usedNames = new Set<string>()
    let processed = 0

    for (const f of batchFiles) {
      if (myGen !== zipGen.current) return
      const url = urls.get(f.fileId)
      if (!url) continue
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Could not fetch ${f.fileName}`)
      const blob = await res.blob()

      let name = f.relativePath || f.fileName
      if (usedNames.has(name)) {
        const dot = name.lastIndexOf('.')
        name = dot === -1 ? `${name}-${f.fileId.slice(0, 8)}` : `${name.slice(0, dot)}-${f.fileId.slice(0, 8)}${name.slice(dot)}`
      }
      usedNames.add(name)
      zip.file(name, blob)

      processed++
      if (myGen === zipGen.current) setZipJob({ phase: 'creating', processed, total: batchFiles.length })
    }

    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
    if (myGen !== zipGen.current) return
    const url = URL.createObjectURL(zipBlob)
    setZipJob({ phase: 'ready', downloadUrl: url, filename: zipFilename })
  }

  // File System Access API path — no zip at all. Each file is streamed
  // (fetch's response body piped straight to a FileSystemWritableFileStream)
  // directly onto disk inside the folder the user picked, so nothing is
  // ever fully buffered in browser memory the way JSZip's blob() approach
  // is. relativePath segments become real nested folders via
  // getDirectoryHandle(..., {create:true}), matching how the zip paths
  // already use relativePath as the in-archive path.
  const downloadAllDirectToFolder = async (myGen: number) => {
    if (!batchFiles || !window.showDirectoryPicker) return
    const rootHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
    if (myGen !== zipGen.current) return

    setZipJob({ phase: 'creating', processed: 0, total: batchFiles.length })
    const data = await fetchDownloadUrls()
    if (myGen !== zipGen.current) return
    const urls = data?.files ? new Map(data.files.map((f) => [f.fileId, f.downloadUrl])) : fetchedUrls
    if (!urls) throw new Error('Could not get download links')

    let processed = 0
    for (const f of batchFiles) {
      if (myGen !== zipGen.current) return
      const url = urls.get(f.fileId)
      if (!url) continue

      const path = (f.relativePath || f.fileName).split('/').filter(Boolean)
      const segments = path.length > 0 ? path : [f.fileName]
      let dir = rootHandle
      for (const segment of segments.slice(0, -1)) {
        dir = await dir.getDirectoryHandle(segment, { create: true })
      }
      const fileHandle = await dir.getFileHandle(segments[segments.length - 1], { create: true })
      const writable = await fileHandle.createWritable()

      const res = await fetch(url)
      if (!res.ok || !res.body) throw new Error(`Could not fetch ${f.fileName}`)
      await res.body.pipeTo(writable)

      processed++
      if (myGen === zipGen.current) setZipJob({ phase: 'creating', processed, total: batchFiles.length })
    }

    if (myGen !== zipGen.current) return
    setZipJob({ phase: 'direct-done' })
  }

  // Large batches (>=1GB): hand off to the dedicated zip Lambda job and
  // poll status every 2s until ready.
  const downloadAllServerSide = async (myGen: number) => {
    const initRes = await fetch(`/api/download/${fileId}/zip`, { method: 'POST' }).then((r) => r.json())
    if (!initRes.success) {
      throw new Error(initRes.message ?? 'Could not start zip creation')
    }
    const { jobId } = initRes.data as { jobId: string }

    while (myGen === zipGen.current) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      if (myGen !== zipGen.current) return
      const statusRes = await fetch(`/api/download/${fileId}/zip/status/${jobId}`).then((r) => r.json())
      if (!statusRes.success) throw new Error('Lost track of the zip job')
      const s = statusRes.data as {
        status: string; processed: number; total: number
        downloadUrl?: string; zipFileName?: string; errorMessage?: string
      }

      if (myGen !== zipGen.current) return

      if (s.status === 'ready' && s.downloadUrl && s.zipFileName) {
        setZipJob({ phase: 'ready', downloadUrl: s.downloadUrl, filename: s.zipFileName })
        return
      }
      if (s.status === 'failed') {
        throw new Error(s.errorMessage ?? 'Zip creation failed')
      }
      setZipJob({ phase: 'creating', processed: s.processed, total: s.total })
    }
  }

  // "Download All" — direct-to-folder (no zip) when the browser supports
  // it; otherwise the existing zip strategy, picked by total batch size.
  const handleDownloadAll = async () => {
    if (!batchFiles) return
    const myGen = ++zipGen.current

    if (SUPPORTS_DIRECTORY_PICKER) {
      try {
        await downloadAllDirectToFolder(myGen)
      } catch (err) {
        if (myGen !== zipGen.current) return
        // User closed the folder picker without choosing one — not an
        // error, just back to idle so they can try again.
        if (err instanceof DOMException && err.name === 'AbortError') {
          setZipJob({ phase: 'idle' })
          return
        }
        setZipJob({ phase: 'error', message: err instanceof Error ? err.message : 'Could not download all files. Please try again or download individually.' })
      }
      return
    }

    setZipJob({ phase: 'creating', processed: 0, total: 0 })
    try {
      const totalBytes = batchFiles.reduce((sum, f) => sum + f.fileSizeBytes, 0)
      if (totalBytes < CLIENT_ZIP_THRESHOLD_BYTES) {
        await downloadAllClientSide(myGen)
      } else {
        await downloadAllServerSide(myGen)
      }
    } catch (err) {
      if (myGen === zipGen.current) {
        setZipJob({ phase: 'error', message: err instanceof Error ? err.message : 'Could not download all files. Please try again or download individually.' })
      }
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

  if (state === 'password-required') {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
          <LockIcon className="w-7 h-7" />
        </div>
        <div>
          <div className="text-text-primary font-semibold text-lg">This transfer is password protected</div>
          <div className="text-muted text-sm mt-1">Enter the password to view and download these files.</div>
        </div>
        <div className={`space-y-2 ${passwordError ? 'motion-safe:animate-[shake_0.4s_ease-in-out]' : ''}`}>
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false) }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleVerifyPassword() }}
            placeholder="Password"
            autoFocus
            className={`w-full bg-bg border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none text-center ${
              passwordError ? 'border-danger' : 'border-border focus:border-accent/60'
            }`}
          />
          {passwordError && <div className="text-xs text-danger">Incorrect password — please try again.</div>}
        </div>
        <button
          onClick={handleVerifyPassword}
          disabled={!passwordInput || verifyingPassword}
          className="w-full bg-accent text-bg font-bold py-3 rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {verifyingPassword ? 'Checking…' : 'Unlock'}
        </button>
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
                    onClick={() => handleFileRowDownload(f.fileId)}
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

        {/* Proactive heads-up, not just an after-the-fact error — shown
            before they even click, only when there's no browser API that
            can save multiple files with folder structure without a zip. */}
        {isBatch && !SUPPORTS_DIRECTORY_PICKER && zipJob.phase === 'idle' && (
          <div className="text-xs text-muted bg-bg border border-border rounded-lg px-3 py-2.5">
            Your browser can&apos;t save multiple files straight to a folder, so these will download as a single ZIP you can extract afterwards.
          </div>
        )}

        {isBatch && zipJob.phase === 'error' && (
          <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">
            {zipJob.message}
          </div>
        )}

        {isBatch && zipJob.phase === 'direct-done' && (
          <div className="bg-success/10 border border-success/30 rounded-lg px-4 py-3 text-sm text-success text-center">
            All {batchFiles?.length ?? 0} files saved to your chosen folder, with the original folder structure intact.
          </div>
        )}

        {isBatch && zipJob.phase === 'ready' ? (
          <a
            href={zipJob.downloadUrl}
            download={zipJob.filename}
            className="w-full bg-success text-bg font-bold py-4 rounded-xl text-lg hover:bg-success/90 transition-colors flex items-center justify-center gap-2"
          >
            <DownloadIcon className="w-5 h-5" />
            Download ZIP ({batchFiles?.length ?? 0} files)
          </a>
        ) : isBatch && zipJob.phase === 'direct-done' ? (
          <button
            onClick={handleDownloadAll}
            className="w-full border border-border text-text-primary font-bold py-4 rounded-xl text-lg hover:border-accent/60 transition-colors flex items-center justify-center gap-2"
          >
            <DownloadIcon className="w-5 h-5" />
            Download Again
          </button>
        ) : (
          <button
            onClick={isBatch ? handleDownloadAll : handleDownload}
            disabled={downloading || zipJob.phase === 'creating'}
            className="w-full bg-accent text-bg font-bold py-4 rounded-xl text-lg hover:bg-accent/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <DownloadIcon className="w-5 h-5" />
            {isBatch
              ? zipJob.phase === 'creating'
                ? zipJob.total > 0
                  ? `${SUPPORTS_DIRECTORY_PICKER ? 'Downloading' : 'Zipping'}… ${zipJob.processed}/${zipJob.total}`
                  : 'Starting…'
                : `Download All (${batchFiles?.length ?? 0} files)`
              : downloading ? 'Preparing download...' : 'Download File'}
          </button>
        )}
      </div>

      <div className="border-t border-border px-8 py-4 bg-bg/50">
        <p className="text-xs text-muted text-center">
          Shared via <span className="text-accent font-medium">VayuTransfer</span> · Secure. Prepaid. No surprises.
        </p>
      </div>
    </div>
  )
}
