'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { StudioTransfer } from '@/types/studio'
import { CHUNK_SIZE, uploadFileInChunks, type PartRecord } from '@/lib/studio/clientUpload'

function studioUrl() {
  return process.env.NEXT_PUBLIC_STUDIO_URL ?? 'https://studio.vayutransfer.com'
}
function shareUrlFor(t: StudioTransfer): string {
  const kind = t.direction === 'SEND' ? 'send' : 'receive'
  return `${studioUrl()}/studio/transfer/${kind}/${t.shareToken}`
}
function formatBytes(bytes?: number): string {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const STATUS_LABEL: Record<StudioTransfer['status'], string> = {
  PENDING: 'Awaiting upload', UPLOADING: 'Uploading…', READY: 'Ready', FAILED: 'Failed', EXPIRED: 'Expired',
}
const STATUS_COLOR: Record<StudioTransfer['status'], string> = {
  PENDING: 'text-muted', UPLOADING: 'text-accent', READY: 'text-success', FAILED: 'text-danger', EXPIRED: 'text-muted',
}

export default function RawTransfersPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const router = useRouter()

  const [transfers, setTransfers] = useState<StudioTransfer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [sendProgress, setSendProgress] = useState<{ filename: string; percent: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/studio/api/admin/projects/${projectId}/transfers`).then((r) => r.json())
    if (res.success) setTransfers(res.data.transfers)
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  // Poll while any RECEIVE transfer is still awaiting/mid-upload — status
  // changes happen on the anonymous side, so this tab needs to notice.
  useEffect(() => {
    const active = transfers.some((t) => t.status === 'PENDING' || t.status === 'UPLOADING')
    if (!active) return
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [transfers, load])

  const copyLink = async (t: StudioTransfer) => {
    await navigator.clipboard.writeText(shareUrlFor(t))
    setCopiedId(t.transferId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const requestFile = async () => {
    setRequesting(true)
    setError(null)
    const res = await fetch(`/studio/api/admin/projects/${projectId}/transfers`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction: 'RECEIVE' }),
    }).then((r) => r.json())
    setRequesting(false)
    if (!res.success) { setError(res.message ?? 'Could not create request link'); return }
    await load()
  }

  const sendFile = async (file: File) => {
    setError(null)
    setSendProgress({ filename: file.name, percent: 0 })
    const partCount = Math.ceil(file.size / CHUNK_SIZE)
    try {
      const initRes = await fetch(`/studio/api/admin/projects/${projectId}/transfers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: 'SEND', filename: file.name, mimeType: file.type, sizeBytes: file.size, partCount }),
      }).then((r) => r.json())
      if (!initRes.success) throw new Error(initRes.message ?? 'Could not start upload')
      const { transferId, uploadId, presignedUrls } = initRes.data

      const parts: PartRecord[] = await uploadFileInChunks(file, presignedUrls, [], (_bytes, partsDone) => {
        setSendProgress({ filename: file.name, percent: Math.round((partsDone / partCount) * 100) })
      })

      const completeRes = await fetch(`/studio/api/admin/projects/${projectId}/transfers/${transferId}/upload-complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, parts }),
      }).then((r) => r.json())
      if (!completeRes.success) throw new Error(completeRes.message ?? 'Could not finish upload')

      setSendProgress(null)
      await load()
    } catch (err) {
      setSendProgress(null)
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  const resend = async (transferId: string) => {
    setBusyId(transferId)
    setError(null)
    const res = await fetch(`/studio/api/admin/projects/${projectId}/transfers/${transferId}/resend`, { method: 'POST' }).then((r) => r.json())
    setBusyId(null)
    if (!res.success) { setError(res.message ?? 'Could not regenerate link'); return }
    await load()
  }

  const importToGallery = async (transferId: string) => {
    setBusyId(transferId)
    setError(null)
    const res = await fetch(`/studio/api/admin/projects/${projectId}/transfers/${transferId}/import`, { method: 'POST' }).then((r) => r.json())
    setBusyId(null)
    if (!res.success) { setError(res.message ?? 'Could not import to gallery'); return }
    await load()
  }

  const removeTransfer = async (transferId: string) => {
    if (!confirm('Delete this transfer? This cannot be undone.')) return
    setBusyId(transferId)
    setError(null)
    const res = await fetch(`/studio/api/admin/projects/${projectId}/transfers/${transferId}`, { method: 'DELETE' }).then((r) => r.json())
    setBusyId(null)
    if (!res.success) { setError(res.message ?? 'Could not delete transfer'); return }
    await load()
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <button onClick={() => router.back()} className="text-sm text-muted hover:text-text-primary transition-colors">← Back</button>
          <span className="text-muted/40">/</span>
          <h1 className="text-xl font-bold text-text-primary">Raw File Transfer</h1>
        </div>
        <p className="text-xs text-muted">
          Send large RAW files to anyone, or request one back — no login required for the other side, no watermarking.
        </p>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!!sendProgress}
          className="flex-1 bg-accent text-bg text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-accent/90 disabled:opacity-50 transition-colors"
        >
          ⬆ Send Raw File
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = '' }}
        />
        <button
          onClick={requestFile}
          disabled={requesting}
          className="flex-1 border border-border text-text-primary text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-border/40 disabled:opacity-50 transition-colors"
        >
          {requesting ? 'Creating…' : '📥 Request File'}
        </button>
      </div>

      {sendProgress && (
        <div className="border border-border rounded-xl px-4 py-3 space-y-2">
          <div className="text-sm text-text-primary break-all">{sendProgress.filename}</div>
          <div className="w-full bg-bg border border-border rounded-full h-2 overflow-hidden">
            <div className="bg-accent h-full transition-all" style={{ width: `${sendProgress.percent}%` }} />
          </div>
          <div className="text-xs text-muted">Uploading… {sendProgress.percent}%</div>
        </div>
      )}

      {/* Transfer list */}
      {transfers.length === 0 && !sendProgress ? (
        <div className="border border-dashed border-border rounded-2xl p-10 text-center space-y-2">
          <div className="text-4xl">📁</div>
          <p className="text-sm text-muted">No transfers yet for this event.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {transfers.map((t) => (
            <div key={t.transferId} className="border border-border rounded-2xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full border border-border text-muted">
                      {t.direction === 'SEND' ? '⬆ Sent' : '📥 Requested'}
                    </span>
                    <span className={`text-xs font-semibold ${STATUS_COLOR[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                    {t.importedToGallery && (
                      <span className="text-xs font-semibold text-success">✓ In gallery</span>
                    )}
                  </div>
                  <div className="text-sm text-text-primary font-medium mt-1 truncate">
                    {t.filename ?? (t.direction === 'RECEIVE' ? 'Waiting for upload…' : '—')}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {formatBytes(t.sizeBytes)} · {formatDate(t.createdAt)}
                    {t.direction === 'SEND' && t.downloadCount > 0 && ` · downloaded ${t.downloadCount}×`}
                  </div>
                  {t.note && <div className="text-xs text-muted italic mt-1">"{t.note}"</div>}
                </div>
              </div>

              <div className="flex gap-2 flex-wrap pt-1">
                {(t.status === 'PENDING' || t.status === 'READY') && (
                  <button
                    onClick={() => copyLink(t)}
                    className="text-xs border border-border text-muted font-semibold px-3 py-1.5 rounded-lg hover:bg-border/40 transition-colors"
                  >
                    {copiedId === t.transferId ? '✓ Copied!' : '🔗 Copy Link'}
                  </button>
                )}
                {t.status !== 'UPLOADING' && (
                  <button
                    onClick={() => resend(t.transferId)}
                    disabled={busyId === t.transferId}
                    className="text-xs border border-border text-muted font-semibold px-3 py-1.5 rounded-lg hover:bg-border/40 disabled:opacity-50 transition-colors"
                  >
                    ↻ Resend
                  </button>
                )}
                {t.direction === 'RECEIVE' && t.status === 'READY' && !t.importedToGallery && (
                  <button
                    onClick={() => importToGallery(t.transferId)}
                    disabled={busyId === t.transferId}
                    className="text-xs bg-accent text-bg font-semibold px-3 py-1.5 rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors"
                  >
                    {busyId === t.transferId ? 'Importing…' : '+ Import to Gallery'}
                  </button>
                )}
                {!t.importedToGallery && (
                  <button
                    onClick={() => removeTransfer(t.transferId)}
                    disabled={busyId === t.transferId}
                    className="text-xs border border-danger/30 text-danger font-semibold px-3 py-1.5 rounded-lg hover:bg-danger/10 disabled:opacity-50 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
