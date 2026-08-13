'use client'

// Relative-positioned popover (not a portal — same pattern RecentTransfersModal
// already uses for its own Extend button) offering +3/+7/+15 days, with a note
// showing days used vs the product-policy max. Extends the transfer's CURRENT
// token in place via PATCH .../extend — never mints a new link (that's Resend).

import type { StudioTransfer } from '@/types/studio'
import { MAX_TRANSFER_EXPIRY_DAYS, TRANSFER_EXTEND_DAY_OPTIONS, DEFAULT_TRANSFER_EXPIRY_DAYS } from '@/lib/studio/transferConfig'

interface Props {
  transfer: StudioTransfer
  busy: boolean
  onExtend: (additionalDays: number) => void
  onClose: () => void
}

export default function TransferExtendPopover({ transfer, busy, onExtend, onClose }: Props) {
  const currentDays = transfer.expiryDays ?? DEFAULT_TRANSFER_EXPIRY_DAYS
  const roomLeft = MAX_TRANSFER_EXPIRY_DAYS - currentDays

  return (
    <div className="absolute right-0 top-full mt-1.5 z-20 bg-card border border-border rounded-xl shadow-2xl py-1.5 w-48"
      onClick={(e) => e.stopPropagation()}>
      <div className="px-3 pb-1.5 pt-0.5 text-[10px] text-muted border-b border-border mb-1">
        {currentDays} of {MAX_TRANSFER_EXPIRY_DAYS} days used
      </div>
      {TRANSFER_EXTEND_DAY_OPTIONS.map((d) => {
        const disabled = busy || roomLeft <= 0
        return (
          <button key={d} onClick={() => onExtend(d)} disabled={disabled}
            className="w-full text-left px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-border/40 disabled:opacity-40 transition-colors">
            +{d} days {roomLeft > 0 && roomLeft < d ? `(capped to +${roomLeft})` : ''}
          </button>
        )
      })}
      {roomLeft <= 0 && (
        <div className="px-3 pt-1 text-[10px] text-muted">Already at the {MAX_TRANSFER_EXPIRY_DAYS}-day maximum</div>
      )}
      <button onClick={onClose} className="w-full text-left px-3 pt-1.5 text-[10px] text-muted hover:text-text-primary transition-colors">
        Cancel
      </button>
    </div>
  )
}
