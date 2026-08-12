'use client'

// Single delete: lightweight popover anchored to the row (not a full modal —
// the impact is one link). Bulk delete, if ever added, should escalate to a
// full centered modal naming the exact count, since the impact is larger —
// not built here since this redesign doesn't add multi-select.

interface Props {
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function TransferDeleteConfirm({ busy, onConfirm, onCancel }: Props) {
  return (
    <div className="absolute right-0 top-full mt-1.5 z-20 bg-card border border-danger/30 rounded-xl shadow-2xl p-3 w-60 space-y-2"
      onClick={(e) => e.stopPropagation()}>
      <p className="text-xs text-text-primary">Delete this transfer? The link will stop working immediately.</p>
      <div className="flex gap-2">
        <button onClick={onCancel} disabled={busy}
          className="flex-1 py-1.5 rounded-lg border border-border text-[11px] font-semibold text-muted hover:text-text-primary transition-colors">
          Cancel
        </button>
        <button onClick={onConfirm} disabled={busy}
          className="flex-1 py-1.5 rounded-lg bg-danger text-white text-[11px] font-bold hover:bg-danger/90 disabled:opacity-60 transition-colors">
          {busy ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  )
}
