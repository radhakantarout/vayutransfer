'use client'

// Deliberately tap-one-and-close, NOT the multi-select-then-Done pattern
// used elsewhere in this codebase (long-press grid select, GalleryPickerModal's
// list-then-navigate) — matches the "one at a time, tap + again for the
// next" interaction the compose screen is built around. No selection state
// of its own; the caller (ReelMvpModal's compose stage) owns what's already
// picked and passes it back as excludeIds so an already-added photo can't
// be picked twice.
export interface ReelPickerPhoto {
  fileId: string
  r2PreviewUrl?: string
  originalFilename: string
}

interface Props {
  photos: ReelPickerPhoto[]
  excludeIds: string[]
  onPick: (fileId: string) => void
  onClose: () => void
}

export default function ReelGalleryPickerModal({ photos, excludeIds, onPick, onClose }: Props) {
  const excludeSet = new Set(excludeIds)
  // r2PreviewUrl absent means still processing/not a real displayable image
  // yet — same eligibility bar the main grid's own reel-select used to
  // apply, just enforced here instead now that selection lives in this
  // picker rather than the grid.
  const eligible = photos.filter((p) => !excludeSet.has(p.fileId) && p.r2PreviewUrl)

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-card border-t sm:border border-border rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <p className="text-sm font-bold text-text-primary">Choose a photo</p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-full bg-border/60 hover:bg-border flex items-center justify-center text-text-primary transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto p-3">
          {eligible.length === 0 ? (
            <p className="text-xs text-muted text-center py-10 px-4">
              {photos.length === 0 ? 'No photos in this gallery yet.' : 'Every eligible photo is already added.'}
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {eligible.map((p) => (
                <button
                  key={p.fileId}
                  onClick={() => onPick(p.fileId)}
                  className="aspect-square rounded-xl overflow-hidden border border-border hover:border-accent transition-colors"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.r2PreviewUrl} alt={p.originalFilename} className="w-full h-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
