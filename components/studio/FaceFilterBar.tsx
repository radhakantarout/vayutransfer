'use client'

import { useState, useEffect } from 'react'

export interface FaceChip {
  faceId: string
  thumbnailUrl: string
  photoCount: number
  label: string | null
}

interface Props {
  token: string
  selectedFaceId: string | null
  onSelect: (faceId: string | null) => void
  onSelfieSearch: () => void
}

export default function FaceFilterBar({ token, selectedFaceId, onSelect, onSelfieSearch }: Props) {
  const [faces, setFaces] = useState<FaceChip[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch(`/studio/api/client/gallery/${token}/faces`)
      .then(r => r.json())
      .then(res => {
        if (res.success) setFaces(res.data.faces)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [token])

  // If feature disabled (403) or no faces yet — hide silently
  if (!loaded || faces.length === 0) return null

  return (
    <div className="w-full overflow-x-auto pb-1 -mx-1 px-1">
      <div className="flex items-center gap-2 min-w-max">
        {/* All Photos chip */}
        <button
          onClick={() => onSelect(null)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors flex-shrink-0
            ${selectedFaceId === null
              ? 'bg-accent text-bg border-accent'
              : 'border-border text-muted hover:text-text-primary hover:border-accent/40'}`}
        >
          All Photos
        </button>

        {/* Face chips */}
        {faces.map(face => (
          <button
            key={face.faceId}
            onClick={() => onSelect(selectedFaceId === face.faceId ? null : face.faceId)}
            className={`flex items-center gap-2 pl-1 pr-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap border transition-all flex-shrink-0
              ${selectedFaceId === face.faceId
                ? 'bg-accent/10 border-accent text-accent ring-2 ring-accent/20'
                : 'border-border text-muted hover:text-text-primary hover:border-accent/30'}`}
          >
            <img
              src={face.thumbnailUrl}
              alt={face.label ?? ''}
              className="w-7 h-7 rounded-full object-cover border border-border flex-shrink-0"
            />
            <span>{face.label ?? face.photoCount + ' photos'}</span>
            <span className="opacity-60 font-normal">{face.photoCount}</span>
          </button>
        ))}

        {/* Selfie search button */}
        <button
          onClick={onSelfieSearch}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border border-border text-muted hover:text-accent hover:border-accent/40 transition-colors flex-shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Find my photos
        </button>
      </div>
    </div>
  )
}
