'use client'

// "Selected Items" step — mirrors VayuTransfer's own file-list + live
// preview layout. Images/video only (Raw Transfer's own restriction), so the
// preview panel is a plain <img>/<video> rather than VayuTransfer's
// all-file-types FilePreviewPanel.

import { useEffect, useMemo, useState } from 'react'
import type { PickedFile } from './useBatchSend'
import { fmtBytes } from './transferUtils'

interface Props {
  items: PickedFile[]
  onRemove: (id: string) => void
  onClearAll: () => void
  onAddFiles: (files: FileList) => void
  onAddFolder: (files: FileList) => void
  onBack: () => void
  onContinue: () => void
}

function ThumbIcon({ file }: { file: File }) {
  if (file.type.startsWith('video/')) {
    return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-2.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-2.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
      </svg>
    )
  }
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
    </svg>
  )
}

export default function RawTransferFileList({ items, onRemove, onClearAll, onAddFiles, onAddFolder, onBack, onContinue }: Props) {
  const [focusedId, setFocusedId] = useState<string | null>(items[0]?.id ?? null)
  const focused = items.find(i => i.id === focusedId) ?? items[0]
  const totalSize = useMemo(() => items.reduce((sum, i) => sum + i.file.size, 0), [items])

  const previewUrl = useMemo(() => {
    if (!focused) return null
    return URL.createObjectURL(focused.file)
  }, [focused])

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1.1fr] gap-4">
      <div className="bg-card border border-border rounded-2xl flex flex-col max-h-[70vh]">
        <div className="px-4 py-3 border-b border-border flex-shrink-0">
          <button onClick={onBack} className="text-xs text-muted hover:text-text-primary transition-colors mb-2">← Back</button>
          <h2 className="text-sm font-bold text-text-primary">Selected Items ({items.length})</h2>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border">
          {items.map(item => (
            <button
              key={item.id}
              onClick={() => setFocusedId(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                focusedId === item.id ? 'bg-accent/5' : 'hover:bg-border/30'
              }`}
            >
              <span className="w-8 h-8 flex-shrink-0 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
                <ThumbIcon file={item.file} />
              </span>
              <span className="flex-1 min-w-0 text-sm text-text-primary truncate">{item.relativePath}</span>
              <span className="text-[11px] text-muted flex-shrink-0">{fmtBytes(item.file.size)}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onRemove(item.id) }}
                className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded text-muted hover:text-danger transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </span>
            </button>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-border flex-shrink-0 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">{items.length} items · Total size: {fmtBytes(totalSize)}</span>
            <button onClick={onClearAll} className="text-danger font-semibold hover:underline">Clear all</button>
          </div>
          <div className="flex gap-2">
            <label className="flex-1 text-center text-xs font-semibold border border-border rounded-lg py-2 cursor-pointer hover:bg-border/40 transition-colors">
              + Add Files
              <input type="file" accept="image/*,video/*" multiple className="hidden"
                onChange={(e) => { if (e.target.files) onAddFiles(e.target.files); e.target.value = '' }} />
            </label>
            <label className="flex-1 text-center text-xs font-semibold border border-border rounded-lg py-2 cursor-pointer hover:bg-border/40 transition-colors">
              + Add Folder
              {/* @ts-expect-error webkitdirectory isn't in the standard input attribute typings */}
              <input type="file" webkitdirectory="" directory="" className="hidden"
                onChange={(e) => { if (e.target.files) onAddFolder(e.target.files); e.target.value = '' }} />
            </label>
          </div>
          <button onClick={onContinue} disabled={items.length === 0}
            className="w-full bg-gradient-to-r from-accent to-[#7C3AED] text-white text-sm font-bold py-2.5 rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity">
            Continue →
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col">
        {focused && previewUrl ? (
          <>
            <div className="flex-1 min-h-[240px] bg-bg flex items-center justify-center">
              {focused.file.type.startsWith('video/') ? (
                <video src={previewUrl} controls className="max-w-full max-h-[50vh]" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt={focused.relativePath} className="max-w-full max-h-[50vh] object-contain" />
              )}
            </div>
            <div className="px-4 py-3 border-t border-border">
              <div className="text-sm font-semibold text-text-primary truncate">{focused.relativePath}</div>
              <div className="text-xs text-muted">{fmtBytes(focused.file.size)}</div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted py-14">No file selected</div>
        )}
      </div>
    </div>
  )
}
