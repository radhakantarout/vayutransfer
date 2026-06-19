'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getDownloadSlotCostPaise, formatPaise } from '@/lib/pricing'
import { FREE_DOWNLOAD_THRESHOLD_BYTES, FREE_DOWNLOAD_EXTRA_SLOT_PAISE } from '@/constants/pricing'
import ShareButtons from '@/components/ShareButtons'
import type { Transfer } from '@/types'

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function statusColor(s: Transfer['status']) {
  if (s === 'active') return 'text-success'
  if (s === 'expired' || s === 'failed') return 'text-danger'
  if (s === 'exhausted') return 'text-yellow-400'
  return 'text-muted'
}

function perSlotCost(fileSizeBytes: number): number {
  return fileSizeBytes <= FREE_DOWNLOAD_THRESHOLD_BYTES
    ? FREE_DOWNLOAD_EXTRA_SLOT_PAISE
    : getDownloadSlotCostPaise(fileSizeBytes)
}

export default function TransfersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  // Share state
  const [sharingFor, setSharingFor] = useState<string | null>(null)

  // Slot-buying state
  const [buyingFor, setBuyingFor] = useState<string | null>(null)
  const [slotsToAdd, setSlotsToAdd] = useState(1)
  const [buying, setBuying] = useState(false)
  const [buyError, setBuyError] = useState<string | null>(null)

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

  const openBuySlots = (fileId: string) => {
    setBuyingFor(fileId)
    setSlotsToAdd(1)
    setBuyError(null)
  }

  const closeBuySlots = () => {
    setBuyingFor(null)
    setBuyError(null)
  }

  const confirmBuySlots = async (fileId: string) => {
    setBuying(true)
    setBuyError(null)
    try {
      const res = await fetch(`/api/transfers/${fileId}/add-slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots: slotsToAdd }),
      })
      const data = await res.json()
      if (!data.success) {
        setBuyError(data.message ?? 'Failed to add slots')
        return
      }
      // Refresh transfers list
      const refreshed = await fetch('/api/transfers').then((r) => r.json())
      if (refreshed.success) setTransfers(refreshed.data)
      closeBuySlots()
    } catch {
      setBuyError('Network error — please try again')
    } finally {
      setBuying(false)
    }
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
            const expired = t.status === 'expired' || new Date(t.expiryTime) < new Date()
            const canExtend = !expired && (t.status === 'active' || t.status === 'exhausted')
            const isOpen = buyingFor === t.fileId
            const isSharing = sharingFor === t.fileId
            const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
            const shareLink = `${appUrl}/download/${t.fileId}`
            const costPerSlot = perSlotCost(t.fileSizeBytes)
            const totalCost = costPerSlot * slotsToAdd

            return (
              <div key={t.fileId} className="bg-card border border-border rounded-2xl p-5 space-y-3">
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
                      <span>{t.downloadsUsed}/{t.downloadSlots} downloads used</span>
                      <span>·</span>
                      <span>{formatPaise(t.amountDeducted)} spent</span>
                      <span>·</span>
                      <span>{new Date(t.createdAt).toLocaleDateString('en-IN')}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!expired && t.status === 'active' && (
                      <button
                        onClick={() => copyLink(t.fileId)}
                        className="text-xs bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 px-3 py-1.5 rounded-lg transition-colors font-medium"
                      >
                        {copied === t.fileId ? 'Copied!' : 'Copy Link'}
                      </button>
                    )}
                    {!expired && t.status === 'active' && (
                      <button
                        onClick={() => setSharingFor(isSharing ? null : t.fileId)}
                        title="Share"
                        className={`px-2.5 py-1.5 border rounded-lg text-xs transition-colors ${isSharing ? 'bg-accent/10 border-accent text-accent' : 'border-border text-muted hover:border-accent hover:text-accent'}`}
                      >
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                        </svg>
                      </button>
                    )}
                    {canExtend && (
                      <button
                        onClick={() => isOpen ? closeBuySlots() : openBuySlots(t.fileId)}
                        className="text-xs bg-card hover:bg-border text-muted hover:text-text-primary border border-border px-3 py-1.5 rounded-lg transition-colors font-medium"
                      >
                        {isOpen ? 'Cancel' : '+ Slots'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline share */}
                {isSharing && (
                  <div className="border-t border-border pt-3">
                    <ShareButtons link={shareLink} fileName={t.fileName} size="sm" />
                  </div>
                )}

                {/* Inline slot buyer */}
                {isOpen && (
                  <div className="border-t border-border pt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-primary font-medium">Buy more download slots</span>
                      <span className="text-xs text-muted">{formatPaise(costPerSlot)}/slot</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setSlotsToAdd(Math.max(1, slotsToAdd - 1))}
                        className="w-8 h-8 rounded-lg border border-border text-text-primary hover:bg-border transition-colors font-bold text-lg leading-none"
                      >
                        −
                      </button>
                      <span className="text-text-primary font-semibold w-8 text-center">{slotsToAdd}</span>
                      <button
                        onClick={() => setSlotsToAdd(Math.min(20, slotsToAdd + 1))}
                        className="w-8 h-8 rounded-lg border border-border text-text-primary hover:bg-border transition-colors font-bold text-lg leading-none"
                      >
                        +
                      </button>
                      <span className="text-muted text-sm ml-1">
                        = <span className="text-text-primary font-semibold">{formatPaise(totalCost)}</span> from wallet
                      </span>
                    </div>

                    {buyError && (
                      <div className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
                        {buyError}
                      </div>
                    )}

                    <button
                      onClick={() => confirmBuySlots(t.fileId)}
                      disabled={buying}
                      className="w-full bg-accent text-bg font-semibold py-2.5 rounded-xl text-sm hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {buying ? 'Processing…' : `Confirm — Pay ${formatPaise(totalCost)}`}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
