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
// How many parts of a SINGLE file upload concurrently — a single TCP stream
// often can't saturate a fast connection (the classic "30 Mbps line, 3 Mbps
// achieved" complaint), especially at higher latency, so running a few in
// parallel gets much closer to the uploader's real ceiling. Kept modest so
// it doesn't hold too many 50MB chunks in memory at once or overwhelm a
// slow connection with competing streams.
export const PART_UPLOAD_CONCURRENCY = 4

export type PartRecord = { PartNumber: number; ETag: string }

// Runs `worker` over `items` with at most `limit` running concurrently —
// used to bound how many parts of one file upload at once.
async function runWithConcurrencyLimit<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  let nextIndex = 0
  const runNext = async (): Promise<void> => {
    const i = nextIndex++
    if (i >= items.length) return
    await worker(items[i], i)
    await runNext()
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runNext()))
}

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

// Uploads every remaining chunk of `file`, skipping any part number already
// present in `completedParts` (resume). Up to PART_UPLOAD_CONCURRENCY parts
// run at once rather than one at a time — R2/S3 multipart uploads don't
// require parts to land in order, only that the final list handed to
// CompleteMultipartUpload is sorted by PartNumber, which is why `parts`
// below is a pre-sized array written by index rather than a push (a push
// would silently reorder the list under concurrency). Calls `onProgress`
// after every part (completed or skipped) with the running byte count —
// tracked via shared counters since parts can now finish in any order.
export async function uploadFileInChunks(
  file: File,
  chunkSize: number,
  presignedUrls: string[],
  completedParts: PartRecord[],
  isAborted: () => boolean,
  onProgress?: (uploadedBytes: number, partsDone: number, partCount: number) => void,
  concurrency = PART_UPLOAD_CONCURRENCY
): Promise<PartRecord[]> {
  const partCount = presignedUrls.length
  const parts: PartRecord[] = new Array(partCount)
  let uploadedBytes = 0
  let partsDone = 0

  await runWithConcurrencyLimit(
    Array.from({ length: partCount }, (_, i) => i),
    concurrency,
    async (i) => {
      if (isAborted()) return
      const partNumber = i + 1
      const partSize = Math.min(chunkSize, file.size - i * chunkSize)
      const already = completedParts.find((p) => p.PartNumber === partNumber)
      if (already) {
        parts[i] = already
      } else {
        const chunk = file.slice(i * chunkSize, (i + 1) * chunkSize)
        const etag = await uploadPartWithRetry(presignedUrls[i], chunk, isAborted)
        parts[i] = { PartNumber: partNumber, ETag: etag }
      }
      uploadedBytes += partSize
      partsDone += 1
      onProgress?.(Math.min(uploadedBytes, file.size), partsDone, partCount)
    }
  )

  return parts
}
