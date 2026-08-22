'use client'

import { useState } from 'react'

// Two-click inline confirm — first click reveals a confirm/cancel pair
// instead of an immediate action or a modal. Matches VayuStudios' own
// admin suspend/delete pattern (app/studio/(owner)/admin/studios/page.tsx).
export default function ConfirmButton({
  label, confirmLabel, onConfirm, className, confirmClassName, disabled,
}: {
  label: string
  confirmLabel?: string
  onConfirm: () => void | Promise<void>
  className?: string
  confirmClassName?: string
  disabled?: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); setConfirming(false) }}
          disabled={busy}
          className={confirmClassName ?? 'text-xs font-semibold text-danger hover:underline disabled:opacity-50'}
        >
          {busy ? 'Working…' : confirmLabel ?? `Confirm ${label}`}
        </button>
        <button onClick={() => setConfirming(false)} className="text-xs text-muted hover:text-text-primary">
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button onClick={() => setConfirming(true)} disabled={disabled} className={className}>
      {label}
    </button>
  )
}
