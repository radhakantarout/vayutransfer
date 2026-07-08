'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface PrintFile {
  fileId: string
  originalFilename: string
  r2PreviewUrl: string | null
  isEdited: boolean
  downloadUrl: string
  sizeBytes: number
  selection: { comment?: string; editingRequired: boolean } | null
}

interface PrintGallery {
  project: { clientName: string; eventDate: string; eventType: string }
  files: PrintFile[]
  expiresAt: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function PrintPortalPage() {
  const { token } = useParams<{ token: string }>()
  const [gallery, setGallery] = useState<PrintGallery | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [downloadAllError, setDownloadAllError] = useState<string | null>(null)

  const downloadAll = async () => {
    setDownloadingAll(true)
    setDownloadAllError(null)
    try {
      const res = await fetch(`/studio/api/print/gallery/${token}/download-all`)
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(gallery?.project.clientName ?? 'photos').replace(/[^a-z0-9]+/gi, '-')}-photos.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setDownloadAllError('Could not download all photos. Please try again or download individually.')
    } finally {
      setDownloadingAll(false)
    }
  }

  useEffect(() => {
    fetch(`/studio/api/print/gallery/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setGallery(d.data)
        else setError(d.error === 'TOKEN_EXPIRED' ? 'This print link has expired.' : 'Invalid or missing link.')
      })
      .catch(() => setError('Could not load print gallery.'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error || !gallery) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <div className="text-4xl">🔗</div>
        <div className="text-text-primary font-semibold">{error ?? 'Gallery not found.'}</div>
        <div className="text-muted text-sm">Please contact the studio for a new link.</div>
      </div>
    </div>
  )

  const { project, files, expiresAt } = gallery
  const editedCount  = files.filter((f) => f.isEdited).length
  const originalCount = files.length - editedCount

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <div className="border-b border-border px-6 py-5">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xl font-extrabold text-text-primary">
                Vayu<span className="text-accent">Studio</span>
                <span className="text-muted font-normal ml-2 text-sm">Print Portal</span>
              </div>
              <div className="text-text-primary font-semibold mt-2">{project.clientName}</div>
              <div className="text-sm text-muted mt-0.5">
                {new Date(project.eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                {' · '}{project.eventType.replace('_', ' ')}
              </div>
            </div>
            <div className="text-right text-xs text-muted">
              <div>Link expires</div>
              <div className="font-semibold text-text-primary">
                {new Date(expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-4 mt-4 flex-wrap">
            <div className="bg-card border border-border rounded-xl px-4 py-2 text-center">
              <div className="text-lg font-bold text-text-primary">{files.length}</div>
              <div className="text-xs text-muted">Total photos</div>
            </div>
            {editedCount > 0 && (
              <div className="bg-card border border-border rounded-xl px-4 py-2 text-center">
                <div className="text-lg font-bold text-success">{editedCount}</div>
                <div className="text-xs text-muted">Edited versions</div>
              </div>
            )}
            {originalCount > 0 && (
              <div className="bg-card border border-border rounded-xl px-4 py-2 text-center">
                <div className="text-lg font-bold text-accent">{originalCount}</div>
                <div className="text-xs text-muted">Originals</div>
              </div>
            )}
            <button
              onClick={downloadAll}
              disabled={downloadingAll}
              className="ml-auto bg-accent text-bg text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {downloadingAll && <span className="w-3.5 h-3.5 border-2 border-bg/40 border-t-bg rounded-full animate-spin" />}
              {downloadingAll ? 'Preparing zip…' : '⬇ Download all'}
            </button>
          </div>
          {downloadAllError && (
            <p className="text-xs text-danger mt-2">{downloadAllError}</p>
          )}
        </div>
      </div>

      {/* Photo list */}
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-3">
        {files.map((f) => (
          <div key={f.fileId} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4">
            {/* Thumbnail */}
            <div className="w-16 h-16 rounded-xl overflow-hidden bg-bg border border-border flex-shrink-0">
              {f.r2PreviewUrl
                ? <img src={f.r2PreviewUrl} alt={f.originalFilename} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-muted text-lg">🖼️</div>}
            </div>

            {/* File info */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-text-primary truncate">{f.originalFilename}</div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-muted">{formatBytes(f.sizeBytes)}</span>
                {f.isEdited ? (
                  <span className="text-xs text-success font-semibold bg-success/10 border border-success/20 px-2 py-0.5 rounded-full">
                    ✓ Edited
                  </span>
                ) : (
                  <span className="text-xs text-muted border border-border px-2 py-0.5 rounded-full">
                    Original
                  </span>
                )}
                {f.selection?.editingRequired && (
                  <span className="text-xs text-yellow-400 border border-yellow-400/30 px-2 py-0.5 rounded-full">
                    ✏️ Editing requested
                  </span>
                )}
              </div>
              {f.selection?.comment && (
                <div className="text-xs text-muted mt-1 italic">"{f.selection.comment}"</div>
              )}
            </div>

            {/* Download */}
            <a
              href={f.downloadUrl || '#'}
              download={f.originalFilename}
              className={`text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex-shrink-0
                ${f.downloadUrl
                  ? 'bg-accent text-bg hover:bg-accent/90'
                  : 'bg-border text-muted cursor-not-allowed pointer-events-none'}`}
            >
              ↓ Download
            </a>
          </div>
        ))}
      </div>

      <div className="text-center text-xs text-muted pb-8">
        Secure link · Do not share · Expires {new Date(expiresAt).toLocaleDateString('en-IN')}
      </div>
    </div>
  )
}
