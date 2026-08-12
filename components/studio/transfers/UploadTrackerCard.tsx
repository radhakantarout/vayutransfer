'use client'

// The live "in-progress upload" tracker — icon, bytes/speed/ETA, percent
// bar, and a cancel button with a warning confirm. Shared between
// TransferActionBar (where a send is kicked off) and TransferDetailPanel
// (shown there too if the admin has that specific transfer's detail panel
// open while it's the one actively uploading).

import { useState } from 'react'
import { SendIcon, SpeedIcon, CancelIcon } from './TransferIcons'
import { fmtBytes, fmtEta, type SendProgress } from './transferUtils'

interface Props {
  sendProgress: SendProgress
  onCancelSend: () => void
}

export default function UploadTrackerCard({ sendProgress, onCancelSend }: Props) {
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)

  return (
    <div className="border border-border rounded-xl px-4 py-3 space-y-2.5">
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 flex-shrink-0 rounded-lg bg-accent/10 text-accent flex items-center justify-center animate-pulse">
          <SendIcon className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-text-primary font-medium truncate">{sendProgress.filename}</div>
          <div className="flex items-center gap-2.5 text-[11px] text-muted mt-0.5 flex-wrap">
            <span>{fmtBytes(sendProgress.uploadedBytes)} / {fmtBytes(sendProgress.totalBytes)}</span>
            <span className="flex items-center gap-1"><SpeedIcon className="w-3 h-3" />{fmtBytes(sendProgress.speedBps)}/s</span>
            <span>{fmtEta(sendProgress.etaSeconds)}</span>
          </div>
        </div>
        <div className="relative flex-shrink-0">
          <button onClick={() => setCancelConfirmOpen(v => !v)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-colors">
            <CancelIcon className="w-4 h-4" />
          </button>
          {cancelConfirmOpen && (
            <div className="absolute right-0 top-full mt-1.5 z-20 bg-card border border-danger/30 rounded-xl shadow-2xl p-3 w-56 space-y-2">
              <p className="text-xs text-text-primary">Cancel this upload? Progress will be lost and the file will need to be resent.</p>
              <div className="flex gap-2">
                <button onClick={() => setCancelConfirmOpen(false)}
                  className="flex-1 py-1.5 rounded-lg border border-border text-[11px] font-semibold text-muted hover:text-text-primary transition-colors">
                  Keep uploading
                </button>
                <button onClick={() => { setCancelConfirmOpen(false); onCancelSend() }}
                  className="flex-1 py-1.5 rounded-lg bg-danger text-white text-[11px] font-bold hover:bg-danger/90 transition-colors">
                  Cancel upload
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="w-full bg-bg border border-border rounded-full h-2 overflow-hidden">
        <div className="bg-accent h-full transition-all duration-150" style={{ width: `${sendProgress.percent}%` }} />
      </div>
      <div className="text-xs text-muted">{sendProgress.percent}% complete</div>
    </div>
  )
}
