'use client'

// Purely presentational — the two options just tell the caller (the
// compose stage in ReelMvpModal) which flow to kick off next (native file
// picker vs ReelGalleryPickerModal). No state of its own.
interface Props {
  onUploadFromDevice: () => void
  onChooseFromGallery: () => void
  onClose: () => void
}

export default function AddReelPhotoSheet({ onUploadFromDevice, onChooseFromGallery, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[90] bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-card border-t sm:border border-border rounded-t-3xl sm:rounded-3xl w-full sm:max-w-xs p-5 space-y-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-bold text-text-primary text-center pb-1">Add a photo</p>
        <button
          onClick={onUploadFromDevice}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-border hover:bg-border/40 hover:border-accent/40 transition-colors text-left"
        >
          <span className="w-9 h-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center flex-shrink-0 text-base">📤</span>
          <span>
            <span className="block text-sm font-semibold text-text-primary">Upload from device</span>
            <span className="block text-[11px] text-muted">Adds it to your gallery too</span>
          </span>
        </button>
        <button
          onClick={onChooseFromGallery}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-border hover:bg-border/40 hover:border-accent/40 transition-colors text-left"
        >
          <span className="w-9 h-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center flex-shrink-0 text-base">🖼️</span>
          <span className="text-sm font-semibold text-text-primary">Choose from gallery</span>
        </button>
        <button onClick={onClose} className="w-full text-xs text-muted py-1.5">Cancel</button>
      </div>
    </div>
  )
}
