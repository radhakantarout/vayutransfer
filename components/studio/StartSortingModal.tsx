'use client'

import { useState } from 'react'
import type { MediaFile, StudioFace } from '@/types/studio'
import AccuracySlider from '@/components/studio/AccuracySlider'

export interface FaceBox { faceId: string; boundingBox: { left: number; top: number; width: number; height: number } }
export type FindSimilarResult =
  | { fileIds: string[] }
  | { needsSelection: true; faces: FaceBox[] }
// Kept 3-way ('group' included) because it's still the exact wire contract
// of the unchanged faces/similar route — 'group' is simply never offered as
// its own button anymore; Solo's own "With others" toggle sends 'group'
// under the hood (see galleryMatchMode).
export type MatchMode = 'solo' | 'group' | 'couple'

interface FindSimilarParams { fileId: string; faceId?: string; secondFaceId?: string; matchMode: MatchMode; coupleExclusive?: boolean }

interface Props {
  files: MediaFile[]  // already AI-enabled photos, passed in from EventSection's own loaded list
  onClose: () => void
  onGrouped: (group: StudioFace) => void
  onCreateGroup: (photoIds: string[], label?: string) => Promise<StudioFace | null>
  // Select one already-indexed photo and find every other indexed photo
  // with the same face(s) — reuses the FaceId(s) Rekognition already
  // computed at index time.
  onFindSimilar: (params: FindSimilarParams) => Promise<FindSimilarResult | null>
  // Same 0-100 dial as the reindex flow (lib/studio/faceAccuracy.ts) — lives
  // in EventSection so it persists across both flows, passed down here just
  // to render/adjust it inline before running a search.
  accuracyLevel: number
  onAccuracyChange: (level: number) => void
}

type SortMode = 'manual' | 'ai'
type AiSubMode = 'solo' | 'couple'
type AiPhase = 'setup' | 'results'

interface FaceChoiceState { fileId: string; imageUrl: string; faces: FaceBox[] }

const PRESET_LABELS = ['Bride', 'Groom', 'Couple', 'Bride Parents', 'Groom Parents']
const AI_MODE_INFO: Record<AiSubMode, { title: string; hint: string }> = {
  solo:   { title: 'Solo',   hint: 'Find every photo of one person' },
  couple: { title: 'Couple', hint: 'Find every photo of two people together' },
}

// Admin-driven grouping over the already AI-enabled photos. Two top-level
// paths: Manual (hand-pick, no AI involved) or AI Sort (pick one reference
// photo already in the gallery and let Rekognition find the rest). AI Sort's
// gallery grid is pre-filtered by each photo's own indexed face count
// (MediaFile.faceCount) — Solo only shows genuinely solo shots, Couple only
// shows photos with 2+ people — since the reference always has to come from
// the gallery anyway, showing ineligible photos there would just be a dead
// end. Both modes converge on the same review grid + naming step + Create
// Group, so switching modes never loses that shared UI.
export default function StartSortingModal({
  files, onClose, onGrouped, onCreateGroup, onFindSimilar, accuracyLevel, onAccuracyChange,
}: Props) {
  const [sortMode, setSortMode] = useState<SortMode | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [finding, setFinding] = useState(false)
  const [error, setError] = useState('')
  const [nameOption, setNameOption] = useState('')
  const [customName, setCustomName] = useState('')

  // AI Sort setup
  const [aiMode, setAiMode] = useState<AiSubMode>('solo')
  // "Just them" (true) vs "With others" (false) — the one toggle shared by
  // both Solo and Couple, replacing the old Solo/Group split and the old
  // Couple-only coupleExclusive pair.
  const [exclusive, setExclusive] = useState(false)
  const [aiPhase, setAiPhase] = useState<AiPhase>('setup')

  // Gallery-photo face-tap disambiguation — shown when the tapped reference
  // photo has more faces than the current mode needs picked out (e.g. a
  // 3-person photo in Couple mode).
  const [faceChoice, setFaceChoice] = useState<FaceChoiceState | null>(null)
  const [coupleSelection, setCoupleSelection] = useState<Set<string>>(new Set())
  const [coupleWarning, setCoupleWarning] = useState(false)

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
    setCoupleWarning(false)
    setError('')
    setNameOption(''); setCustomName('')
    setAiPhase('setup')
    setFinding(false)
  }

  const changeMode = () => { resetPicker(); setSortMode(null) }
  const resetAiSetup = () => { resetPicker() }  // stays in AI mode, just clears the in-progress search

  // Solo/"With others" maps onto the unchanged faces/similar contract as
  // 'group' (no exclusivity filter) — see the MatchMode doc comment above.
  const galleryMatchMode = (): MatchMode => aiMode === 'couple' ? 'couple' : (exclusive ? 'solo' : 'group')

  // Only offer photos the current mode could plausibly use as a reference —
  // a genuinely solo shot for Solo, a photo with 2+ people for Couple.
  // MediaFile.faceCount is written by the index-faces Lambda at index time.
  const eligibleFiles = files.filter(f =>
    aiMode === 'couple' ? (f.faceCount ?? 0) >= 2 : f.faceCount === 1
  )

  const handlePickGalleryReference = async (fileId: string) => {
    setFinding(true); setError(''); setCoupleWarning(false)
    const result = await onFindSimilar({
      fileId, matchMode: galleryMatchMode(),
      ...(aiMode === 'couple' ? { coupleExclusive: exclusive } : {}),
    })
    setFinding(false)
    if (!result) { setError('No matching faces found for this photo.'); return }
    if ('needsSelection' in result) {
      const imageUrl = files.find(f => f.fileId === fileId)?.r2PreviewUrl ?? ''
      setFaceChoice({ fileId, imageUrl, faces: result.faces })
      return
    }
    if (aiMode === 'couple') { setCoupleWarning(true); return }
    if (result.fileIds.length === 0) { setError('No matching faces found for this photo.'); return }
    setSelected(new Set(result.fileIds)); setAiPhase('results')
  }

  const handleChooseFace = async (faceId: string) => {
    if (!faceChoice) return
    setFinding(true); setError('')
    const result = await onFindSimilar({ fileId: faceChoice.fileId, faceId, matchMode: galleryMatchMode() })
    setFinding(false); setFaceChoice(null)
    if (!result) { setError('No matching faces found for this photo.'); return }
    if ('needsSelection' in result) return
    if (result.fileIds.length === 0) { setError('No matching faces found for this photo.'); return }
    setSelected(new Set(result.fileIds)); setAiPhase('results')
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
    const [faceIdA, faceIdB] = Array.from(coupleSelection)
    setFinding(true); setError('')
    const result = await onFindSimilar({
      fileId: faceChoice.fileId, faceId: faceIdA, secondFaceId: faceIdB,
      matchMode: 'couple', coupleExclusive: exclusive,
    })
    setFinding(false); setFaceChoice(null); setCoupleSelection(new Set())
    if (!result) { setError('No photos found with both people together.'); return }
    if ('needsSelection' in result) return
    if (result.fileIds.length === 0) { setError('No photos found with both people together.'); return }
    setSelected(new Set(result.fileIds)); setAiPhase('results')
  }

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

  // Shared review grid — hand-picked (Manual) or pre-checked from a search
  // (AI, once results are in) — both let the admin add/remove before saving.
  const showReviewGrid = sortMode === 'manual' || (sortMode === 'ai' && aiPhase === 'results')

  const headerSubtitle = (() => {
    if (!sortMode) return "Choose how you'd like to sort these photos."
    if (sortMode === 'manual') return 'Pick photos by hand, then group them.'
    if (faceChoice) return `Tap the ${aiMode === 'couple' ? 'two faces' : 'face'} you want to find.`
    if (aiPhase === 'results') return 'Review the matches, adjust if needed, then group them.'
    return aiMode === 'couple' ? 'Pick a photo with just the two of them.' : 'Pick a solo photo of them.'
  })()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              {sortMode && (
                <button onClick={changeMode} title="Change mode"
                  className="text-muted hover:text-text-primary transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                  </svg>
                </button>
              )}
              <h2 className="text-base font-bold text-text-primary">Start Sorting</h2>
            </div>
            <p className="text-xs text-muted mt-0.5">{headerSubtitle}</p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-text-primary hover:bg-border/60 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Step 1: choose Manual vs AI ─────────────────────────────── */}
        {!sortMode && (
          <div className="px-5 py-6 grid grid-cols-2 gap-3">
            <button onClick={() => setSortMode('manual')}
              className="text-left p-4 rounded-2xl border-2 border-border hover:border-accent/60 hover:bg-accent/5 transition-colors space-y-1.5">
              <div className="text-2xl">🖐️</div>
              <p className="text-sm font-bold text-text-primary">Manual Sort</p>
              <p className="text-xs text-muted">You pick the photos — full control.</p>
            </button>
            <button onClick={() => setSortMode('ai')}
              className="text-left p-4 rounded-2xl border-2 border-border hover:border-accent/60 hover:bg-accent/5 transition-colors space-y-1.5">
              <div className="text-2xl">✨</div>
              <p className="text-sm font-bold text-text-primary">AI Sort</p>
              <p className="text-xs text-muted">Pick one photo — we'll find the rest.</p>
            </button>
          </div>
        )}

        {/* ── AI Sort setup: mode pill, exclusivity toggle, accuracy —
            hidden once a search has produced results or a face-choice tap
            is in progress (those get the full body). ───────────────────── */}
        {sortMode === 'ai' && aiPhase === 'setup' && !faceChoice && (
          <div className="px-5 pt-3 pb-2 border-b border-border flex-shrink-0 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-bg border border-border rounded-xl p-1 flex-shrink-0">
                {(Object.keys(AI_MODE_INFO) as AiSubMode[]).map(m => (
                  <button key={m} type="button" onClick={() => { setAiMode(m); resetAiSetup() }}
                    title={AI_MODE_INFO[m].hint}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                      aiMode === m ? 'bg-accent text-bg shadow-sm' : 'text-muted hover:text-text-primary'
                    }`}>
                    {AI_MODE_INFO[m].title}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 bg-bg border border-border rounded-full p-1 flex-shrink-0">
                <button type="button" onClick={() => setExclusive(false)}
                  title="This person appears — anyone else may also be in the photo"
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
                    !exclusive ? 'bg-accent text-bg shadow-sm' : 'text-muted hover:text-text-primary'
                  }`}>
                  With others
                </button>
                <button type="button" onClick={() => setExclusive(true)}
                  title="Only photos with just them — no one else in frame"
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
                    exclusive ? 'bg-accent text-bg shadow-sm' : 'text-muted hover:text-text-primary'
                  }`}>
                  Just them
                </button>
              </div>
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
              <span>That photo only has one face — Couple needs two people together. Try a different photo, or switch to Solo.</span>
            </div>
          )}

          {finding && !faceChoice && (
            <div className="flex flex-col items-center gap-3 py-14">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted">Finding matches…</p>
            </div>
          )}

          {/* Face-tap disambiguation — for a reference photo with more
              faces than this mode needs picked out. */}
          {faceChoice && !finding ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-text-primary text-center">
                {aiMode === 'couple'
                  ? `Tap the two faces to pair (${coupleSelection.size}/2 selected)`
                  : `This photo has ${faceChoice.faces.length} faces — tap the one you want to find`}
              </p>
              <div className="relative mx-auto max-w-md rounded-xl overflow-hidden bg-black/10">
                {faceChoice.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={faceChoice.imageUrl} alt="" className="w-full h-auto block" />
                )}
                {faceChoice.faces.map((f, i) => {
                  const isCoupleSelected = aiMode === 'couple' && coupleSelection.has(f.faceId)
                  return (
                    <button
                      key={f.faceId}
                      onClick={() => aiMode === 'couple' ? toggleCoupleFace(f.faceId) : handleChooseFace(f.faceId)}
                      title={`Face ${i + 1}`}
                      style={{
                        left: `${f.boundingBox.left * 100}%`,
                        top: `${f.boundingBox.top * 100}%`,
                        width: `${f.boundingBox.width * 100}%`,
                        height: `${f.boundingBox.height * 100}%`,
                      }}
                      className={`absolute border-2 rounded-md transition-colors flex items-start justify-end p-0.5 ${
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
                {aiMode === 'couple' && (
                  <button onClick={handleFindCouple} disabled={coupleSelection.size !== 2}
                    className="text-xs font-bold text-bg bg-accent px-4 py-2 rounded-xl hover:bg-accent/90 disabled:opacity-40 transition-colors">
                    Find Couple
                  </button>
                )}
                <button onClick={() => { setFaceChoice(null); setCoupleSelection(new Set()) }}
                  className="text-xs text-muted font-semibold hover:text-text-primary transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          ) : sortMode === 'ai' && aiPhase === 'setup' && !finding ? (
            eligibleFiles.length === 0 ? (
              <p className="text-sm text-muted text-center py-14">
                {aiMode === 'couple'
                  ? 'No photos with two or more people found yet.'
                  : 'No solo photos found yet.'}
                <br />Try Manual Sort instead, or switch modes above.
              </p>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                {eligibleFiles.map(f => (
                  <button key={f.fileId} onClick={() => handlePickGalleryReference(f.fileId)}
                    className="relative aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-accent transition-colors">
                    {f.r2PreviewUrl
                      ? <img src={f.r2PreviewUrl} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full bg-border/40 flex items-center justify-center text-muted text-xs">📄</div>}
                  </button>
                ))}
              </div>
            )
          ) : showReviewGrid && !finding ? (
            files.length === 0 ? (
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
            )
          ) : null}
        </div>

        {/* Group naming — appears once there's a selection to save, so it's
            visible while reviewing results, not a separate extra step. */}
        {showReviewGrid && !faceChoice && selected.size > 0 && (
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

        {showReviewGrid && (
          <div className="flex items-center gap-3 px-5 py-4 border-t-0 flex-shrink-0">
            <span className="text-xs font-semibold text-muted flex-1">{selected.size} selected</span>
            {sortMode === 'ai' && (
              <button onClick={resetAiSetup} disabled={saving}
                className="text-xs text-muted font-semibold hover:text-text-primary disabled:opacity-40 transition-colors">
                Search again
              </button>
            )}
            {selected.size > 0 && (
              <button onClick={() => setSelected(new Set())} disabled={saving}
                className="text-xs text-muted font-semibold hover:text-text-primary disabled:opacity-40 transition-colors">
                Reselect
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
        )}

        {!showReviewGrid && sortMode && (
          <div className="flex items-center justify-end px-5 py-4 flex-shrink-0">
            <button onClick={onClose}
              className="text-sm border border-border text-muted font-semibold px-4 py-2 rounded-xl hover:bg-border/40 transition-colors">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
