'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Transfer } from '@/types'

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatPaise(p: number) {
  return `₹${(p / 100).toFixed(2)}`
}

function statusColor(s: Transfer['status']) {
  if (s === 'active') return 'text-success'
  if (s === 'expired' || s === 'failed') return 'text-danger'
  if (s === 'exhausted') return 'text-yellow-400'
  return 'text-muted'
}

export default function TransfersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
  }, [status, router])

  useEffect(() => {
    if (!session) return
    fetch('/api/transfers')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setTransfers(d.data)
        else setError(d.message ?? 'Failed to load transfers')
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false))
  }, [session])

  const copyLink = async (fileId: string) => {
    const appUrl = window.location.origin
    await navigator.clipboard.writeText(`${appUrl}/download/${fileId}`)
    setCopied(fileId)
    setTimeout(() => setCopied(null), 2000)
  }

  if (status === 'loading' || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text-primary">My Transfers</h1>
        <Link
          href="/"
          className="bg-accent text-bg text-sm font-semibold px-4 py-2 rounded-lg hover:bg-accent/90 transition-colors"
        >
          + New Transfer
        </Link>
      </div>

      {loading && (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {!loading && !error && transfers.length === 0 && (
        <div className="text-center py-20 space-y-4">
          <div className="text-5xl">📂</div>
          <div className="text-text-primary font-semibold text-lg">No transfers yet</div>
          <div className="text-muted text-sm">Upload your first file to get a shareable link</div>
          <Link href="/" className="inline-block bg-accent text-bg text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-accent/90 transition-colors mt-2">
            Upload a File
          </Link>
        </div>
      )}

      {!loading && transfers.length > 0 && (
        <div className="space-y-3">
          {transfers.map((t) => {
            const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
            const expired = t.status === 'expired' || new Date(t.expiryTime) < new Date()
            return (
              <div key={t.fileId} className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-text-primary truncate">{t.fileName}</span>
                      <span className={`text-xs font-medium capitalize ${statusColor(expired ? 'expired' : t.status)}`}>
                        {expired ? 'expired' : t.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted mt-1 flex-wrap">
                      <span>{formatBytes(t.fileSizeBytes)}</span>
                      <span>·</span>
                      <span>{t.downloadsUsed}/{t.downloadSlots} downloads</span>
                      <span>·</span>
                      <span>{formatPaise(t.amountDeducted)} spent</span>
                      <span>·</span>
                      <span>{new Date(t.createdAt).toLocaleDateString('en-IN')}</span>
                    </div>
                  </div>
                  {!expired && t.status === 'active' && (
                    <button
                      onClick={() => copyLink(t.fileId)}
                      className="flex-shrink-0 text-xs bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 px-3 py-1.5 rounded-lg transition-colors font-medium"
                    >
                      {copied === t.fileId ? 'Copied!' : 'Copy Link'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
