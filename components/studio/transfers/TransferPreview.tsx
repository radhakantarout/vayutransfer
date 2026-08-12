'use client'

// Native browser rendering only — img/video/audio/iframe — no custom
// file-viewer is built. Unsupported types (RAW, ZIP, etc.) fall back to an
// icon + message + Download button, using the same presigned URL.

import { useEffect, useState } from 'react'
import type { StudioTransfer } from '@/types/studio'
import { fileKindFromMime } from './transferUtils'
import { FileTypeIcon } from './TransferIcons'

interface Props {
  transfer: StudioTransfer
  projectId: string
}

export default function TransferPreview({ transfer: t, projectId }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const kind = fileKindFromMime(t.mimeType)

  useEffect(() => {
    setUrl(null); setError(false)
    if (t.status !== 'READY' || !t.r2Key) return
    fetch(`/studio/api/admin/projects/${projectId}/transfers/${t.transferId}/preview-url`)
      .then(r => r.json())
      .then(res => { if (res.success) setUrl(res.data.url); else setError(true) })
      .catch(() => setError(true))
  }, [t.transferId, t.status, t.r2Key, projectId])

  if (t.status !== 'READY') {
    return (
      <div className="aspect-video bg-bg border border-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted">
        <FileTypeIcon kind={kind} className="w-8 h-8" />
        <p className="text-xs">{t.direction === 'RECEIVE' ? 'Waiting for the file to arrive…' : 'Upload in progress…'}</p>
      </div>
    )
  }

  if (error || (kind === 'generic' || kind === 'archive')) {
    return (
      <div className="aspect-video bg-bg border border-border rounded-xl flex flex-col items-center justify-center gap-2.5 text-muted">
        <FileTypeIcon kind={kind} className="w-8 h-8" />
        <p className="text-xs">{error ? 'Could not load preview' : 'No preview available for this file type'}</p>
        {url && (
          <a href={url} download={t.filename}
            className="text-xs font-bold text-accent hover:underline">
            Download to view
          </a>
        )}
      </div>
    )
  }

  if (!url) {
    return (
      <div className="aspect-video bg-bg border border-border rounded-xl flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (kind === 'image') {
    return <img src={url} alt={t.filename} className="w-full max-h-[420px] object-contain bg-bg border border-border rounded-xl" />
  }
  if (kind === 'video') {
    return <video src={url} controls className="w-full max-h-[420px] bg-black rounded-xl" />
  }
  if (kind === 'audio') {
    return (
      <div className="bg-bg border border-border rounded-xl p-6 flex flex-col items-center gap-3">
        <FileTypeIcon kind="audio" className="w-8 h-8 text-muted" />
        <audio src={url} controls className="w-full" />
      </div>
    )
  }
  if (kind === 'pdf') {
    return <iframe src={url} className="w-full h-[420px] bg-white border border-border rounded-xl" title={t.filename} />
  }
  return null
}
