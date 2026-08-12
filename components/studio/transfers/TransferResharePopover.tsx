'use client'

// Resurfaces the transfer's CURRENT link for sharing via a new channel — a
// pure UI action, no backend mutation, when the link is still valid (Active/
// Extended/Expiring soon). Reshare is deliberately NOT the same as Resend:
// Resend mints a brand-new token and silently breaks any copy of the link
// already sent to someone, so this popover only falls back to minting a new
// one (via the existing resend endpoint) when the transfer has actually
// expired and there's nothing valid left to reshare.

import { useState } from 'react'
import type { StudioTransfer } from '@/types/studio'
import { transferShareUrl } from './transferUtils'

interface Props {
  transfer: StudioTransfer
  isExpired: boolean
  resendBusy: boolean
  onResend: () => void
  onClose: () => void
}

export default function TransferResharePopover({ transfer, isExpired, resendBusy, onResend, onClose }: Props) {
  const [copied, setCopied] = useState(false)
  const url = transferShareUrl(transfer)

  const copy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="absolute right-0 top-full mt-1.5 z-20 bg-card border border-border rounded-xl shadow-2xl p-3 w-64 space-y-2"
      onClick={(e) => e.stopPropagation()}>
      {isExpired ? (
        <>
          <p className="text-xs text-muted">This link has expired — generate a fresh one to reshare.</p>
          <button onClick={onResend} disabled={resendBusy}
            className="w-full py-1.5 rounded-lg bg-accent text-bg text-xs font-bold hover:bg-accent/90 disabled:opacity-60 transition-colors">
            {resendBusy ? 'Generating…' : 'Generate new link'}
          </button>
        </>
      ) : (
        <>
          <div className="bg-bg border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-muted truncate">{url}</div>
          <div className="flex items-center gap-1.5">
            <button onClick={copy}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-border text-[11px] font-semibold text-text-primary hover:bg-border/40 transition-colors">
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(url)}`, '_blank')}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-border text-[11px] font-semibold text-green-500 hover:bg-green-500/10 transition-colors">
              WhatsApp
            </button>
            <a href={`mailto:?body=${encodeURIComponent(url)}`}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-border text-[11px] font-semibold text-muted hover:text-text-primary hover:bg-border/40 transition-colors">
              Email
            </a>
          </div>
        </>
      )}
      <button onClick={onClose} className="w-full text-left text-[10px] text-muted hover:text-text-primary transition-colors">Close</button>
    </div>
  )
}
