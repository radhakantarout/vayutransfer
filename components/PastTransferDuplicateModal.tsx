'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircleIcon, CheckCircleIcon, CopyIcon } from '@/components/icons'

interface Props {
  fileName: string
  shareableLink: string
  createdAt: string
  expiryTime: string
  replacing: boolean
  onUseExisting: () => void
  onReplace: () => void
  onCancel: () => void
}

function fmtRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diffMs / 86_400_000)
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Shown when a newly-added file matches an ACTIVE past transfer (same name
// + size) already sent from this wallet. "Replace" is a real destructive
// action (the old link stops working for anyone who still has it) so it
// gets its own inline confirm step rather than firing immediately.
export default function PastTransferDuplicateModal({
  fileName, shareableLink, createdAt, expiryTime, replacing, onUseExisting, onReplace, onCancel,
}: Props) {
  const [confirmingReplace, setConfirmingReplace] = useState(false)
  const [copied, setCopied] = useState(false)
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
  }, [])

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareableLink)
    setCopied(true)
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
    copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !replacing) onCancel() }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-5 pt-5 pb-4 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/10 text-yellow-500 flex items-center justify-center">
            <AlertCircleIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-text-primary">You already sent this file</h2>
            <p className="text-xs text-muted mt-1 truncate">{fileName}</p>
            <p className="text-xs text-muted mt-0.5">Sent {fmtRelative(createdAt)} · link active until {new Date(expiryTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
          </div>

          <div className="flex items-center gap-2 bg-bg border border-border rounded-lg px-3 py-2">
            <span className="flex-1 text-xs text-text-primary font-mono truncate">{shareableLink}</span>
            <button
              onClick={copyLink}
              title="Copy link"
              className="flex-shrink-0 text-muted hover:text-accent transition-colors"
            >
              {copied ? <CheckCircleIcon className="w-4 h-4 text-success" /> : <CopyIcon className="w-4 h-4" />}
            </button>
          </div>

          {confirmingReplace && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2.5 space-y-2">
              <p className="text-xs text-danger">
                The old link will stop working immediately — anyone who has it will see &quot;This download link has expired.&quot; This can&apos;t be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmingReplace(false)}
                  disabled={replacing}
                  className="flex-1 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted hover:text-text-primary transition-colors"
                >
                  Never mind
                </button>
                <button
                  onClick={onReplace}
                  disabled={replacing}
                  className="flex-1 py-1.5 rounded-lg bg-danger text-white text-xs font-bold hover:bg-danger/90 disabled:opacity-60 transition-colors"
                >
                  {replacing ? 'Replacing…' : 'Confirm replace'}
                </button>
              </div>
            </div>
          )}
        </div>

        {!confirmingReplace && (
          <div className="px-5 pb-5 space-y-2">
            <button
              onClick={onUseExisting}
              className="w-full py-2.5 rounded-xl bg-accent text-bg text-sm font-bold hover:bg-accent/90 transition-colors"
            >
              Use existing link
            </button>
            <button
              onClick={() => setConfirmingReplace(true)}
              className="w-full py-2.5 rounded-xl border border-border text-text-primary text-sm font-semibold hover:bg-bg transition-colors"
            >
              Replace — send a new copy instead
            </button>
            <button
              onClick={onCancel}
              className="w-full py-2 text-muted text-xs hover:text-text-primary transition-colors"
            >
              Cancel — don&apos;t add this file
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
