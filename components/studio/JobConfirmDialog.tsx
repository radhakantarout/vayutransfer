'use client'

// Shared confirmation-dialog shape for anything that kicks off (or cancels) a
// background bulk job — bulk watermark, AI sorting/face-indexing, and the
// "stop processing?" cancel warning. Consolidates what used to be one-off
// inline markup (see EventSection.tsx's showReindexConfirm) into a single
// reusable look so every trigger point converges on the same style instead
// of drifting into slightly different ad hoc dialogs.
export default function JobConfirmDialog({
  icon = '✨',
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  danger = false,
  busy = false,
}: {
  icon?: string
  title: string
  message: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
  busy?: boolean
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="text-center space-y-2">
          <div className="text-3xl">{icon}</div>
          <p className="text-sm font-bold text-text-primary">{title}</p>
          <p className="text-xs text-muted leading-relaxed">{message}</p>
        </div>
        <div className="space-y-2">
          <button onClick={onConfirm} disabled={busy}
            className={`w-full text-sm font-bold py-2.5 rounded-xl transition-colors disabled:opacity-60 ${
              danger ? 'bg-danger text-white hover:bg-danger/90' : 'bg-accent text-bg hover:bg-accent/90'
            }`}>
            {busy ? 'Working…' : confirmLabel}
          </button>
          <button onClick={onCancel} disabled={busy}
            className="w-full text-sm text-muted font-semibold py-2 hover:text-text-primary transition-colors disabled:opacity-60">
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
