'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { CopyIcon, CheckCircleIcon } from '@/components/icons'
import FeedbackWidget from '@/components/FeedbackWidget'
import type { ReceiveRequest } from '@/types'

const POLL_MS = 4000

function statusBadge(status: ReceiveRequest['status'], isExpired: boolean) {
  if (isExpired) return { label: 'Expired', cls: 'bg-danger/10 text-danger' }
  switch (status) {
    case 'fulfilled': return { label: 'Received', cls: 'bg-success/10 text-success' }
    case 'uploading': return { label: 'Uploading…', cls: 'bg-accent/10 text-accent' }
    case 'cancelled': return { label: 'Cancelled', cls: 'bg-bg text-muted' }
    case 'expired': return { label: 'Expired', cls: 'bg-danger/10 text-danger' }
    default: return { label: 'Waiting', cls: 'bg-yellow-500/10 text-yellow-500' }
  }
}

export default function ReceiveRequestsPanel() {
  const [requests, setRequests] = useState<ReceiveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/receive-requests').then((r) => r.json())
      if (res.success) setRequests(res.data.requests)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Poll only while something is still in flight — no point hammering the
  // API once every request has settled into a terminal state.
  useEffect(() => {
    const hasLive = requests.some((r) => r.status === 'pending' || r.status === 'uploading')
    if (timerRef.current) clearTimeout(timerRef.current)
    if (hasLive) {
      timerRef.current = setTimeout(load, POLL_MS)
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [requests, load])

  const copyLink = async (requestId: string) => {
    const appUrl = window.location.origin
    await navigator.clipboard.writeText(`${appUrl}/receive/${requestId}`)
    setCopied(requestId)
    setTimeout(() => setCopied(null), 2000)
  }

  if (loading || requests.length === 0) return null

  return (
    <div className="mb-8 space-y-3">
      <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">Receive Requests</h2>
      <div className="space-y-2">
        {requests.map((r) => {
          const isExpired = r.status === 'pending' && new Date() > new Date(r.expiryTime)
          const badge = statusBadge(r.status, isExpired)
          return (
            <div key={r.requestId} className="space-y-2">
              <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between gap-3 hover:border-accent/30 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                    <span className="text-xs text-muted">{new Date(r.createdAt).toLocaleDateString('en-IN')}</span>
                  </div>
                  {(r.requestTitle || r.message) && (
                    <div className="text-sm text-text-primary truncate mt-1 font-medium">{r.requestTitle || r.message}</div>
                  )}
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
                  {r.status === 'fulfilled' && r.resultFileId && (
                    <Link
                      href={`/download/${r.resultFileId}`}
                      className="text-xs bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 px-3 py-1.5 rounded-lg transition-colors font-medium"
                    >
                      View File
                    </Link>
                  )}
                  {(r.status === 'pending' && !isExpired) && (
                    <button
                      onClick={() => copyLink(r.requestId)}
                      className="flex items-center gap-1.5 text-xs border border-border px-3 py-1.5 rounded-lg text-muted hover:text-text-primary transition-colors font-medium"
                    >
                      {copied === r.requestId ? <CheckCircleIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
                      {copied === r.requestId ? 'Copied' : 'Copy Link'}
                    </button>
                  )}
                </div>
              </div>
              {r.status === 'fulfilled' && r.resultFileId && (
                <FeedbackWidget subjectType="receiveRequest" subjectId={r.requestId} role="requester" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
