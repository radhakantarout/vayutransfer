'use client'

import { useState } from 'react'
import type { MediaFile, StudioFace } from '@/types/studio'
import AccuracySlider from '@/components/studio/AccuracySlider'

export interface FaceBox { faceId: string; boundingBox: { left: number; top: number; width: number; height: number } }
export type FindSimilarResult =
  | { fileIds: string[] }
  | { needsSelection: true; faces: FaceBox[] }
export type MatchMode = 'solo' | 'group' | 'couple'

interface FindSimilarParams { fileId: string; faceId?: string; secondFaceId?: string; matchMode: MatchMode; coupleExclusive?: boolean }

interface Props {
  files: MediaFile[]  // already AI-enabled photos, passed in from EventSection's own loaded list
  onClose: () => void
  onGrouped: (group: StudioFace) => void
  onCreateGroup: (photoIds: string[], label?: string) => Promise<StudioFace | null>
  // Select exactly one photo, find every other indexed photo with the same
  // face (reuses the face Rekognition already computed at index time — no
  // re-upload, no selfie). If the photo has more than one face, the backend
  // can't guess which one you mean — it comes back with `needsSelection` and
  // each face's bounding box instead, and this component asks again with the
  // chosen `faceId` (or two, for Couple) once the admin picks.
  onFindSimilar: (params: FindSimilarParams) => Promise<FindSimilarResult | null>
  // Same 0-100 dial as the reindex flow (lib/studio/faceAccuracy.ts) — lives
  // in EventSection so it persists across both flows, passed down here just
  // to render/adjust it inline before running Find Similar Faces.
  accuracyLevel: number
  onAccuracyChange: (level: number) => void
}

const PRESET_LABELS = ['Bride', 'Groom', 'Couple', 'Bride Parents', 'Groom Parents']
const MODE_INFO: Record<MatchMode, { title: string; hint: string }> = {
  solo:   { title: 'Solo',  hint: 'Only this person in the photo — no one else' },
  group:  { title: 'Group', hint: 'This person appears — anyone else may too' },
  couple: { title: 'Couple', hint: 'Pick two faces — only photos with both together' },
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
  const [matchMode, setMatchMode] = useState<MatchMode>('group')
  // Set when the reference photo has 2+ faces and we need the admin to pick
  // which one (Solo/Group) or which two (Couple) before we can search —
  // holds the photo's own fileId (to fetch its preview for the overlay)
  // plus each detected face's bounding box.
  const [faceChoice, setFaceChoice] = useState<{ fileId: string; faces: FaceBox[] } | null>(null)
  // Couple mode only — up to 2 toggled face ids from the picker above.
  const [coupleSelection, setCoupleSelection] = useState<Set<string>>(new Set())
  // Couple mode only — "with others" (default, matches the original couple
  // behavior: both present, anyone else may be too) vs "only these two"
  // (exclusive: reject any match where a third indexed face is present).
  const [coupleExclusive, setCoupleExclusive] = useState(false)
  // Couple mode was requested but the reference photo only has one face —
  // nothing to pair against.
  const [coupleWarning, setCoupleWarning] = useState(false)
  const [nameOption, setNameOption] = useState('')
  const [customName, setCustomName] = useState('')

  const toggle = (fileId: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(fileId) ? next.delete(fileId) : next.add(fileId)
      return next
    })
  }

  const resetPicker = () => {
    setSelected(new Set())
    setFaceChoice(null)
    setCoupleSelection(new Set())
    setCoupleExclusive(false)
    setCoupleWarning(false)
    setError('')
    setNameOption('')
    setCustomName('')
  }

  const handleFindSimilar = async () => {
    if (selected.size !== 1) return
    const [fileId] = Array.from(selected)
    setFinding(true); setError(''); setCoupleWarning(false)
    const result = await onFindSimilar({ fileId, matchMode })
    setFinding(false)
    if (!result) { setError('No matching faces found for this photo.'); return }
    if ('needsSelection' in result) { setFaceChoice({ fileId, faces: result.faces }); return }
    // A direct (non-needsSelection) result while in Couple mode means the
    // reference photo only had one face detected — nothing to pair against.
    if (matchMode === 'couple') { setCoupleWarning(true); return }
    if (result.fileIds.length === 0) { setError('No matching faces found for this photo.'); return }
    setSelected(new Set(result.fileIds))
  }

  const handleChooseFace = async (faceId: string) => {
    if (!faceChoice) return
    const fileId = faceChoice.fileId
    setFinding(true); setError('')
    const result = await onFindSimilar({ fileId, faceId, matchMode })
    setFinding(false)
    setFaceChoice(null)
    if (!result) { setError('No matching faces found for this photo.'); return }
    if ('needsSelection' in result) return
    if (result.fileIds.length === 0) { setError('No matching faces found for this photo.'); return }
    setSelected(new Set(result.fileIds))
  }

  const toggleCoupleFace = (faceId: string) => {
    setCoupleSelection(prev => {
      const next = new Set(prev)
      if (next.has(faceId)) { next.delete(faceId); return next }
      if (next.size >= 2) {
        const oldest = Array.from(next)[0]
        next.delete(oldest)
      }
      next.add(faceId)
      return next
    })
  }

  const handleFindCouple = async () => {
    if (!faceChoice || coupleSelection.size !== 2) return
    const [faceId, secondFaceId] = Array.from(coupleSelection)
    const fileId = faceChoice.fileId
    setFinding(true); setError('')
    const result = await onFindSimilar({ fileId, faceId, secondFaceId, matchMode: 'couple', coupleExclusive })
    setFinding(false)
    setFaceChoice(null)
    setCoupleSelection(new Set())
    if (!result) { setError('No photos found with both people together.'); return }
    if ('needsSelection' in result) return
    if (result.fileIds.length === 0) { setError('No photos found with both people together.'); return }
    setSelected(new Set(result.fileIds))
  }

  const choicePhoto = faceChoice ? files.find(f => f.fileId === faceChoice.fileId) : undefined

  const resolvedLabel = nameOption === 'Other' ? customName.trim() : nameOption

  const handleCreate = async () => {
    if (selected.size === 0) return
    setSaving(true)
    setError('')
    const group = await onCreateGroup(Array.from(selected), resolvedLabel || undefined)
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

        {/* Match mode + accuracy — hidden during the face-choice picker so
            the photo/boxes get full attention, same as before. */}
        {!faceChoice && (
          <div className="px-5 pt-3 pb-2 border-b border-border flex-shrink-0 space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-bg border border-border rounded-xl p-1 flex-shrink-0">
                {(Object.keys(MODE_INFO) as MatchMode[]).map(m => (
                  <button key={m} type="button" onClick={() => { setMatchMode(m); setCoupleWarning(false) }}
                    title={MODE_INFO[m].hint}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                      matchMode === m ? 'bg-accent text-bg shadow-sm' : 'text-muted hover:text-text-primary'
                    }`}>
                    {MODE_INFO[m].title}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted flex-1 min-w-0 truncate">{MODE_INFO[matchMode].hint}</p>
            </div>
            <AccuracySlider value={accuracyLevel} onChange={onAccuracyChange} label="Accuracy" compact />
          </div>
        )}

        <div className="overflow-y-auto px-4 py-4 flex-1">
          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2.5 text-xs text-danger mb-3">{error}</div>
          )}
          {coupleWarning && (
            <div className="bg-accent/10 border border-accent/30 rounded-lg px-3 py-2.5 text-xs text-text-primary mb-3 flex items-start gap-2">
              <span className="flex-shrink-0">💡</span>
              <span>This photo only has one face — Couple mode needs two people together. Pick a different photo, or switch to Solo/Group.</span>
            </div>
          )}
          {faceChoice ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-text-primary text-center">
                {matchMode === 'couple'
                  ? `Tap the two faces to pair (${coupleSelection.size}/2 selected)`
                  : `This photo has ${faceChoice.faces.length} faces — tap the one you want to find`}
              </p>
              {matchMode === 'couple' && (
                <div className="flex items-center justify-center gap-1 bg-bg border border-border rounded-full p-1 w-fit mx-auto">
                  <button type="button" onClick={() => setCoupleExclusive(false)}
                    title="Both people appear — anyone else may also be in the photo"
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                      !coupleExclusive ? 'bg-accent text-bg shadow-sm' : 'text-muted hover:text-text-primary'
                    }`}>
                    With others
                  </button>
                  <button type="button" onClick={() => setCoupleExclusive(true)}
                    title="Only these two — reject any match with a third person also in frame"
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                      coupleExclusive ? 'bg-accent text-bg shadow-sm' : 'text-muted hover:text-text-primary'
                    }`}>
                    Only these two
                  </button>
                </div>
              )}
              <div className="relative mx-auto max-w-md rounded-xl overflow-hidden bg-black/10">
                {choicePhoto?.r2PreviewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={choicePhoto.r2PreviewUrl} alt="" className="w-full h-auto block" />
                )}
                {faceChoice.faces.map((f, i) => {
                  const isCoupleSelected = matchMode === 'couple' && coupleSelection.has(f.faceId)
                  return (
                    <button
                      key={f.faceId}
                      onClick={() => matchMode === 'couple' ? toggleCoupleFace(f.faceId) : handleChooseFace(f.faceId)}
                      disabled={finding}
                      title={`Face ${i + 1}`}
                      style={{
                        left: `${f.boundingBox.left * 100}%`,
                        top: `${f.boundingBox.top * 100}%`,
                        width: `${f.boundingBox.width * 100}%`,
                        height: `${f.boundingBox.height * 100}%`,
                      }}
                      className={`absolute border-2 rounded-md transition-colors disabled:opacity-50 flex items-start justify-end p-0.5 ${
                        isCoupleSelected ? 'border-accent bg-accent/30' : 'border-accent/70 bg-accent/10 hover:bg-accent/30'
                      }`}
                    >
                      <span className={`text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center ${isCoupleSelected ? 'bg-accent' : 'bg-accent/70'}`}>
                        {isCoupleSelected ? '✓' : i + 1}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center justify-center gap-4">
                {matchMode === 'couple' && (
                  <button onClick={handleFindCouple} disabled={finding || coupleSelection.size !== 2}
                    className="text-xs font-bold text-bg bg-accent px-4 py-2 rounded-xl hover:bg-accent/90 disabled:opacity-40 transition-colors">
                    {finding ? 'Finding…' : 'Find Couple'}
                  </button>
                )}
                <button onClick={() => { setFaceChoice(null); setCoupleSelection(new Set()) }} disabled={finding}
                  className="text-xs text-muted font-semibold hover:text-text-primary transition-colors">
                  {finding && matchMode !== 'couple' ? 'Finding…' : 'Cancel'}
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

        {/* Group naming — appears once there's a selection to save, so it's
            visible while reviewing results, not a separate extra step. */}
        {!faceChoice && selected.size > 0 && (
          <div className="px-5 pt-3 pb-1 border-t border-border flex-shrink-0 flex items-center gap-2">
            <label className="text-[11px] font-semibold text-muted whitespace-nowrap flex-shrink-0">Name this group</label>
            <select value={nameOption} onChange={e => setNameOption(e.target.value)}
              className="bg-bg border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent/60 transition-colors">
              <option value="">Unnamed</option>
              {PRESET_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
              <option value="Other">Other…</option>
            </select>
            {nameOption === 'Other' && (
              <input
                type="text"
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder="e.g. Bride's Sister"
                maxLength={50}
                className="flex-1 min-w-0 bg-bg border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors"
              />
            )}
          </div>
        )}

        <div className="flex items-center gap-3 px-5 py-4 border-t-0 flex-shrink-0">
          <span className="text-xs font-semibold text-muted flex-1">{selected.size} selected</span>
          {selected.size > 0 && !faceChoice && (
            <button onClick={resetPicker} disabled={finding || saving}
              className="text-xs text-muted font-semibold hover:text-text-primary disabled:opacity-40 transition-colors">
              Reselect
            </button>
          )}
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
