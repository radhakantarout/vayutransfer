'use client'

import { useState } from 'react'
import type { MediaFile, StudioFace } from '@/types/studio'
import AccuracySlider from '@/components/studio/AccuracySlider'

export interface FaceBox { faceId: string; boundingBox: { left: number; top: number; width: number; height: number } }
export type FindSimilarResult =
  | { fileIds: string[] }
  | { needsSelection: true; faces: FaceBox[] }

interface Props {
  files: MediaFile[]  // already AI-enabled photos, passed in from EventSection's own loaded list
  onClose: () => void
  onGrouped: (group: StudioFace) => void
  onCreateGroup: (photoIds: string[]) => Promise<StudioFace | null>
  // Select exactly one photo, find every other indexed photo with the same
  // face (reuses the face Rekognition already computed at index time — no
  // re-upload, no selfie). If the photo has more than one face, the backend
  // can't guess which one you mean — it comes back with `needsSelection` and
  // each face's bounding box instead, and this component asks again with the
  // chosen `faceId` once the admin clicks the right one.
  onFindSimilar: (fileId: string, faceId?: string) => Promise<FindSimilarResult | null>
  // Same 0-100 dial as the reindex flow (lib/studio/faceAccuracy.ts) — lives
  // in EventSection so it persists across both flows, passed down here just
  // to render/adjust it inline before running Find Similar Faces.
  accuracyLevel: number
  onAccuracyChange: (level: number) => void
}

// Admin-driven grouping over the already AI-enabled photos (same references
// EventSection already has in memory — no selfie search, no local file
// upload). Two ways to build a selection: pick photos by hand, or select one
// photo and "Find Similar Faces" to auto-select everyone else with the same
// face, then adjust by hand before saving. Deliberately a separate focused
// picker rather than routing through the full grid + selection bar, so
// "start sorting" stays a single, obvious action.
export default function StartSortingModal({ files, onClose, onGrouped, onCreateGroup, onFindSimilar, accuracyLevel, onAccuracyChange }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [finding, setFinding] = useState(false)
  const [error, setError] = useState('')
  // Set when the reference photo has 2+ faces and we need the admin to pick
  // which one before we can search — holds the photo's own fileId (to fetch
  // its preview for the overlay) plus each detected face's bounding box.
  const [faceChoice, setFaceChoice] = useState<{ fileId: string; faces: FaceBox[] } | null>(null)

  const toggle = (fileId: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(fileId) ? next.delete(fileId) : next.add(fileId)
      return next
    })
  }

  const applyResult = (result: FindSimilarResult | null) => {
    if (!result) { setError('No matching faces found for this photo.'); return }
    if ('needsSelection' in result) return // caller already set faceChoice
    if (result.fileIds.length === 0) { setError('No matching faces found for this photo.'); return }
    setSelected(new Set(result.fileIds))
  }

  const handleFindSimilar = async () => {
    if (selected.size !== 1) return
    const [fileId] = Array.from(selected)
    setFinding(true)
    setError('')
    const result = await onFindSimilar(fileId)
    setFinding(false)
    if (result && 'needsSelection' in result) { setFaceChoice({ fileId, faces: result.faces }); return }
    applyResult(result)
  }

  const handleChooseFace = async (faceId: string) => {
    if (!faceChoice) return
    const fileId = faceChoice.fileId
    setFinding(true)
    setError('')
    const result = await onFindSimilar(fileId, faceId)
    setFinding(false)
    setFaceChoice(null)
    applyResult(result)
  }

  const choicePhoto = faceChoice ? files.find(f => f.fileId === faceChoice.fileId) : undefined

  const handleCreate = async () => {
    if (selected.size === 0) return
    setSaving(true)
    setError('')
    const group = await onCreateGroup(Array.from(selected))
    setSaving(false)
    if (!group) { setError('Failed to create group. Please try again.'); return }
    onGrouped(group)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-text-primary">Start Sorting</h2>
            <p className="text-xs text-muted mt-0.5">Select one photo of a person and tap Find Similar Faces — or pick photos by hand — then group them.</p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-text-primary hover:bg-border/60 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-4 flex-1">
          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2.5 text-xs text-danger mb-3">{error}</div>
          )}
          {faceChoice ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-text-primary text-center">
                This photo has {faceChoice.faces.length} faces — tap the one you want to find
              </p>
              <div className="relative mx-auto max-w-md rounded-xl overflow-hidden bg-black/10">
                {choicePhoto?.r2PreviewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={choicePhoto.r2PreviewUrl} alt="" className="w-full h-auto block" />
                )}
                {faceChoice.faces.map((f, i) => (
                  <button
                    key={f.faceId}
                    onClick={() => handleChooseFace(f.faceId)}
                    disabled={finding}
                    title={`Face ${i + 1}`}
                    style={{
                      left: `${f.boundingBox.left * 100}%`,
                      top: `${f.boundingBox.top * 100}%`,
                      width: `${f.boundingBox.width * 100}%`,
                      height: `${f.boundingBox.height * 100}%`,
                    }}
                    className="absolute border-2 border-accent rounded-md bg-accent/10 hover:bg-accent/30 transition-colors disabled:opacity-50 flex items-start justify-end p-0.5"
                  >
                    <span className="bg-accent text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{i + 1}</span>
                  </button>
                ))}
              </div>
              <div className="flex justify-center">
                <button onClick={() => setFaceChoice(null)} disabled={finding}
                  className="text-xs text-muted font-semibold hover:text-text-primary transition-colors">
                  {finding ? 'Finding…' : 'Cancel'}
                </button>
              </div>
            </div>
          ) : files.length === 0 ? (
            <p className="text-sm text-muted text-center py-14">No AI-enabled photos yet.</p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {files.map(f => {
                const isSelected = selected.has(f.fileId)
                return (
                  <button
                    key={f.fileId}
                    onClick={() => toggle(f.fileId)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                      isSelected ? 'border-accent' : 'border-transparent hover:border-border'
                    }`}
                  >
                    {f.r2PreviewUrl
                      ? <img src={f.r2PreviewUrl} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full bg-border/40 flex items-center justify-center text-muted text-xs">📄</div>}
                    <div className={`absolute top-1.5 right-1.5 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      isSelected ? 'bg-accent border-accent text-white' : 'bg-black/40 border-white/70'
                    }`}>
                      {isSelected && (
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {!faceChoice && (
          <div className="px-5 pt-3 pb-1 border-t border-border flex-shrink-0">
            <AccuracySlider value={accuracyLevel} onChange={onAccuracyChange} label="Find Similar Faces accuracy" />
          </div>
        )}
        <div className="flex items-center gap-3 px-5 py-4 border-t-0 flex-shrink-0">
          <span className="text-xs font-semibold text-muted flex-1">{selected.size} selected</span>
          {selected.size === 1 && (
            <button onClick={handleFindSimilar} disabled={finding}
              className="flex items-center gap-1.5 text-sm border border-accent/40 text-accent font-semibold px-3 py-2 rounded-xl hover:bg-accent/10 disabled:opacity-50 transition-colors">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.344.344a.75.75 0 01-.53.22H9.75a.75.75 0 01-.53-.22l-.344-.344z" />
              </svg>
              {finding ? 'Finding…' : 'Find Similar Faces'}
            </button>
          )}
          <button onClick={onClose}
            className="text-sm border border-border text-muted font-semibold px-4 py-2 rounded-xl hover:bg-border/40 transition-colors">
            Cancel
          </button>
          <button onClick={handleCreate} disabled={selected.size === 0 || saving}
            className="bg-accent text-bg text-sm font-bold px-4 py-2 rounded-xl hover:bg-accent/90 disabled:opacity-50 transition-colors">
            {saving ? 'Creating…' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  )
}
