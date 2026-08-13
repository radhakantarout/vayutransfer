'use client'

import { FileTypeIcon, AlertCircleIcon } from '@/components/icons'

interface Props {
  duplicatePaths: string[]
  onOverwrite: () => void
  onKeepBoth: () => void
  onCancel: () => void
}

// Shown when adding files/a folder whose name(s) already exist in the
// current selection — mirrors the standard OS file-manager "this already
// exists" choice (Overwrite / Keep both) rather than silently merging or
// silently deduping. Applies to every duplicate in this add as one batch
// decision, not a per-file prompt.
export default function DuplicateFilesModal({ duplicatePaths, onOverwrite, onKeepBoth, onCancel }: Props) {
  const shown = duplicatePaths.slice(0, 4)
  const extra = duplicatePaths.length - shown.length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-5 pt-5 pb-4 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/10 text-yellow-500 flex items-center justify-center">
            <AlertCircleIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-text-primary">
              {duplicatePaths.length === 1 ? 'This file is already added' : `${duplicatePaths.length} files are already added`}
            </h2>
            <p className="text-xs text-muted mt-1">Overwrite the existing one, or keep both copies?</p>
          </div>

          <div className="border border-border rounded-xl divide-y divide-border max-h-32 overflow-y-auto">
            {shown.map((path) => (
              <div key={path} className="flex items-center gap-2 px-3 py-2">
                <FileTypeIcon fileName={path} isFolder={path.includes('/')} className="w-4 h-4 text-muted flex-shrink-0" />
                <span className="text-xs text-text-primary truncate">{path}</span>
              </div>
            ))}
            {extra > 0 && (
              <div className="px-3 py-2 text-xs text-muted">+{extra} more</div>
            )}
          </div>
        </div>

        <div className="px-5 pb-5 space-y-2">
          <button
            onClick={onKeepBoth}
            className="w-full py-2.5 rounded-xl bg-accent text-bg text-sm font-bold hover:bg-accent/90 transition-colors"
          >
            Keep both
          </button>
          <button
            onClick={onOverwrite}
            className="w-full py-2.5 rounded-xl border border-border text-text-primary text-sm font-semibold hover:bg-bg transition-colors"
          >
            Overwrite existing
          </button>
          <button
            onClick={onCancel}
            className="w-full py-2 text-muted text-xs hover:text-text-primary transition-colors"
          >
            Cancel — don't add {duplicatePaths.length === 1 ? 'it' : 'these'}
          </button>
        </div>
      </div>
    </div>
  )
}
