'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface TransferInfo {
  filename: string
  mimeType: string
  sizeBytes: number
  downloadUrl: string
  note: string | null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

export default function TransferSendPage() {
  const { token } = useParams<{ token: string }>()
  const [info, setInfo] = useState<TransferInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/studio/api/transfer/send/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setInfo(d.data)
        else if (d.error === 'TOKEN_EXPIRED') setError('This link has expired.')
        else if (d.error === 'NOT_READY') setError('This file is still uploading — try again shortly.')
        else setError('Invalid or missing link.')
      })
      .catch(() => setError('Could not load this file.'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error || !info) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <div className="text-4xl">🔗</div>
        <div className="text-text-primary font-semibold">{error ?? 'File not found.'}</div>
        <div className="text-muted text-sm">Please contact the sender for a new link.</div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center space-y-5">
        <div className="text-xl font-extrabold text-text-primary">
          Vayu<span className="text-accent">Studio</span>
          <span className="text-muted font-normal ml-2 text-sm">File Transfer</span>
        </div>
        <div className="text-5xl">📁</div>
        <div>
          <div className="text-text-primary font-semibold break-all">{info.filename}</div>
          <div className="text-sm text-muted mt-1">{formatBytes(info.sizeBytes)}</div>
        </div>
        {info.note && (
          <div className="text-xs text-muted italic bg-bg border border-border rounded-xl px-3 py-2">"{info.note}"</div>
        )}
        <a
          href={info.downloadUrl}
          download={info.filename}
          className="block bg-accent text-bg text-sm font-bold px-5 py-3 rounded-xl hover:bg-accent/90 transition-colors"
        >
          ⬇ Download File
        </a>
        <div className="text-xs text-muted">Secure link · Do not share</div>
      </div>
    </div>
  )
}
