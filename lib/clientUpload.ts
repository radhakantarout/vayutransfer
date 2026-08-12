// Chunked-upload client logic for VayuTransfer's own upload flow. Deliberately
// a separate file from lib/studio/clientUpload.ts (never shared, even though
// the logic is generic) — same retry/timeout/resume shape, kept as its own
// copy per the established no-shared-runtime-code rule between products.

export const MAX_PART_RETRIES = 3
// A 50MB chunk on a slow connection can legitimately take a while — generous
// on purpose. Without any timeout at all, a request that never gets a
// response just hangs forever (neither resolves nor rejects).
export const PART_UPLOAD_TIMEOUT_MS = 120_000
// The lightweight JSON init/complete/status calls should always be fast — a
// much shorter timeout still gives real headroom without letting a truly
// wedged request sit unnoticed for two minutes.
export const UPLOAD_JSON_TIMEOUT_MS = 30_000

export type PartRecord = { PartNumber: number; ETag: string }

// Retries a transient network blip (common on slow connections) before
// giving up on this part — most failures resolve within 1-2 retries without
// the user ever needing to notice or manually resume.
//
// `isAborted` (optional) is checked before each attempt and, critically,
// before/after the backoff sleep — without this a user cancelling mid-retry
// still had to wait out the full backoff (up to 2s) before the cancel took
// effect, since the timer itself had no early-exit.
export async function uploadPartWithRetry(url: string, chunk: Blob, isAborted?: () => boolean): Promise<string> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= MAX_PART_RETRIES; attempt++) {
    if (isAborted?.()) throw new DOMException('Upload cancelled', 'AbortError')
    try {
      const res = await fetch(url, { method: 'PUT', body: chunk, signal: AbortSignal.timeout(PART_UPLOAD_TIMEOUT_MS) })
      if (!res.ok) throw new Error(`Part upload failed: ${res.status}`)
      const etag = res.headers.get('ETag')
      if (!etag) throw new Error('Missing ETag')
      return etag
    } catch (err) {
      if (isAborted?.()) throw err
      lastErr = err
      if (attempt < MAX_PART_RETRIES) await new Promise((r) => setTimeout(r, attempt * 1000))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Part upload failed')
}

// Wraps fetch with a timeout for the small JSON init/complete/status calls —
// callers just pass their usual fetch args, this only adds the abort signal.
export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = UPLOAD_JSON_TIMEOUT_MS): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
}

// Uploads every remaining chunk of `file` in order, skipping any part number
// already present in `completedParts` (resume). Calls `onProgress` after
// every part (completed or skipped) with the running byte count.
export async function uploadFileInChunks(
  file: File,
  chunkSize: number,
  presignedUrls: string[],
  completedParts: PartRecord[],
  isAborted: () => boolean,
  onProgress?: (uploadedBytes: number, partsDone: number, partCount: number) => void
): Promise<PartRecord[]> {
  const partCount = presignedUrls.length
  const parts: PartRecord[] = []

  for (let i = 0; i < partCount; i++) {
    if (isAborted()) return parts
    const partNumber = i + 1
    const already = completedParts.find((p) => p.PartNumber === partNumber)
    if (already) {
      parts.push(already)
    } else {
      const chunk = file.slice(i * chunkSize, (i + 1) * chunkSize)
      const etag = await uploadPartWithRetry(presignedUrls[i], chunk, isAborted)
      parts.push({ PartNumber: partNumber, ETag: etag })
    }
    onProgress?.(Math.min(parts.length * chunkSize, file.size), parts.length, partCount)
  }

  return parts
}
