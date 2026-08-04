// One user-facing "Accuracy" dial (0-100) standing in for two separate
// Rekognition knobs that are otherwise too technical to expose directly:
//   - QualityFilter (index time) — how strict Rekognition is about which
//     detected faces are even worth keeping a face vector for.
//   - FaceMatchThreshold (search time) — how similar two face vectors must
//     be to count as "the same person" in Find Similar Faces / AI Sort.
// Higher = fewer, more confident results (less risk of the wrong person
// slipping in); lower = more results, but a higher chance of mistakes.
// 85 is the tested default — raising FaceMatchThreshold from the original
// 70 to 85 measurably cut down false positives without losing any real
// matches on a real test album.
export const DEFAULT_AI_ACCURACY = 85
export const AI_ACCURACY_STORAGE_KEY = 'vayu_studio_ai_accuracy'

export type QualityFilterLevel = 'NONE' | 'LOW' | 'AUTO' | 'MEDIUM' | 'HIGH'

export function accuracyToMatchThreshold(level: number): number {
  // Rekognition's own FaceMatchThreshold is already a 0-100 scale, so this
  // is a direct pass-through — just clamped to a sane floor (below ~50 the
  // results stop being meaningfully "the same person" at all).
  return Math.min(99, Math.max(50, Math.round(level)))
}

export function accuracyToQualityFilter(level: number): QualityFilterLevel {
  if (level <= 30) return 'NONE'
  if (level <= 55) return 'LOW'
  if (level <= 80) return 'AUTO'
  if (level <= 92) return 'MEDIUM'
  return 'HIGH'
}

export function describeAccuracy(level: number): string {
  if (level < 50) return 'Very loose — most matches, higher chance of wrong photos'
  if (level < 70) return 'Loose — more matches, occasional mistakes'
  if (level < 85) return 'Balanced'
  if (level < 95) return 'Precise (recommended)'
  return 'Very strict — only extremely confident matches'
}

export function loadAccuracyLevel(): number {
  if (typeof window === 'undefined') return DEFAULT_AI_ACCURACY
  const raw = window.localStorage.getItem(AI_ACCURACY_STORAGE_KEY)
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : DEFAULT_AI_ACCURACY
}

export function saveAccuracyLevel(level: number): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(AI_ACCURACY_STORAGE_KEY, String(level))
}
