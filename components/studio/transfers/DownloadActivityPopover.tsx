'use client'

// Shows what the data model actually tracks — a running count + the last
// download's timestamp, not a full per-download log (StudioTransfer has no
// per-event history; adding one would mean either an unbounded list on the
// item or a new table, flagged as a bigger addition if ever wanted).

import type { StudioTransfer } from '@/types/studio'
import { fmtExact, fmtRelative } from './transferUtils'

interface Props {
  transfer: StudioTransfer
  onClose: () => void
}

export default function DownloadActivityPopover({ transfer, onClose }: Props) {
  return (
    <div className="absolute right-0 top-full mt-1.5 z-20 bg-card border border-border rounded-xl shadow-2xl p-3 w-56 space-y-1.5"
      onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-text-primary">{transfer.downloadCount} download{transfer.downloadCount !== 1 ? 's' : ''}</span>
        <button onClick={onClose} className="text-muted hover:text-text-primary text-[10px]">Close</button>
      </div>
      {transfer.lastDownloadedAt ? (
        <p className="text-[11px] text-muted" title={fmtExact(transfer.lastDownloadedAt)}>
          Last downloaded {fmtRelative(transfer.lastDownloadedAt)}
        </p>
      ) : (
        <p className="text-[11px] text-muted">Not downloaded yet.</p>
      )}
    </div>
  )
}
