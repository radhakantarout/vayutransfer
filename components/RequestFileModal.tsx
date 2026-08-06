'use client'

import { useState } from 'react'
import { EXPIRY_DAY_OPTIONS, DEFAULT_EXPIRY_DAYS } from '@/constants/pricing'
import { InboxIcon, CopyIcon, CheckCircleIcon } from '@/components/icons'

interface Props {
  onClose: () => void
  onCreated: () => void
}

export default function RequestFileModal({ onClose, onCreated }: Props) {
  const [message, setMessage] = useState('')
  const [expiryDays, setExpiryDays] = useState<number>(DEFAULT_EXPIRY_DAYS)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleCreate = async () => {
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/receive-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim() || undefined, expiryDays }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.message ?? 'Failed to create receive link')
        return
      }
      setLink(data.data.receiveLink)
      onCreated()
    } catch {
      setError('Network error — please try again')
    } finally {
      setCreating(false)
    }
  }

  const copyLink = async () => {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {!link ? (
          <>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
                <InboxIcon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-text-primary text-lg">Request a File</h3>
            </div>
            <p className="text-sm text-muted">
              Get a link you can send to anyone — they upload directly to you, no account needed on their end.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted">Message (optional)</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="e.g. Please send the raw wedding footage"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted">Link stays open for</label>
              <div className="flex gap-2">
                {EXPIRY_DAY_OPTIONS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setExpiryDays(days)}
                    className={`flex-1 text-sm font-semibold py-2 rounded-lg border transition-colors ${
                      expiryDays === days
                        ? 'bg-accent/10 border-accent text-accent'
                        : 'border-border text-muted hover:border-accent/50 hover:text-text-primary'
                    }`}
                  >
                    {days} days
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</div>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="flex-1 text-sm border border-border rounded-lg py-2.5 text-muted hover:text-text-primary transition-colors">
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 bg-accent text-bg font-semibold text-sm rounded-lg py-2.5 hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create Link'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="font-bold text-text-primary text-lg">Link ready</h3>
            <p className="text-sm text-muted">Share this with whoever you want to receive a file from.</p>
            <div className="bg-bg border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary break-all">
              {link}
            </div>
            <div className="flex gap-2">
              <button
                onClick={copyLink}
                className="flex-1 flex items-center justify-center gap-1.5 bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 rounded-lg py-2.5 text-sm font-medium transition-colors"
              >
                {copied ? <CheckCircleIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
              <button onClick={onClose} className="flex-1 border border-border rounded-lg py-2.5 text-sm text-muted hover:text-text-primary transition-colors">
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
