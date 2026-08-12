// Shared chunked-upload client logic. Used by the studio admin gallery
// upload flow (page.tsx / EventSection.tsx) and the Raw File Transfer flows
// (admin SEND, anonymous RECEIVE). Each caller fetches its own presigned
// URLs and any already-completed parts (for resume) — those endpoints differ
// per flow (JWT-header'd admin routes vs. token-in-path anonymous routes) —
// then hands off to uploadFileInChunks, which does the actual
// chunking/retry/progress work identically everywhere.

export const CHUNK_SIZE = 50 * 1024 * 1024
export const MAX_PART_RETRIES = 3
// A 50MB chunk on a slow connection can legitimately take a while — generous
// on purpose. Without any timeout at all, a request that never gets a
// response just hangs forever (neither resolves nor rejects), which is what
// let hundreds of large-batch uploads get stuck with no error ever surfacing.
export const PART_UPLOAD_TIMEOUT_MS = 120_000
// The lightweight JSON init/complete calls should always be fast — a much
// shorter timeout here still gives real headroom without letting a truly
// wedged request sit unnoticed for two minutes.
export const UPLOAD_JSON_TIMEOUT_MS = 30_000
// How many parts of a SINGLE file upload concurrently — a single TCP stream
// often under-uses available bandwidth, especially on higher-latency
// connections, so running a few in parallel gets closer to the uploader's
// actual ceiling. Same order of magnitude as MAX_CONCURRENT_UPLOADS (the
// cross-file concurrency cap in EventSection.tsx) — kept modest so it
// doesn't hold too many 50MB chunks in memory at once or overwhelm a slow
// connection with competing streams.
export const PART_UPLOAD_CONCURRENCY = 4

export type PartRecord = { PartNumber: number; ETag: string }

// Retries a transient network blip (common on slow connections) before
// giving up on this part — most failures resolve within 1-2 retries without
// the user ever needing to notice or manually resume.
//
// `signal` is an optional caller-provided cancel signal (distinct from the
// fixed per-part timeout below) — a deliberate cancel is never retried, it
// propagates immediately so the caller's own cancel flow can clean up.
export async function uploadPartWithRetry(url: string, chunk: Blob, signal?: AbortSignal): Promise<string> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= MAX_PART_RETRIES; attempt++) {
    if (signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError')
    try {
      const timeoutSignal = AbortSignal.timeout(PART_UPLOAD_TIMEOUT_MS)
      const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
      const res = await fetch(url, { method: 'PUT', body: chunk, signal: combined })
      if (!res.ok) throw new Error(`Part upload failed: ${res.status}`)
      return res.headers.get('ETag') ?? ''
    } catch (err) {
      if (signal?.aborted) throw err
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

// Runs `worker` over `items` with at most `limit` running concurrently —
// selecting 1000 files and firing 1000 simultaneous upload chains at once
// overwhelms both the browser's connection pool and the backend (each chain
// does its own multipart-initiate + N part PUTs + complete). This keeps a
// bounded number active at a time; the rest simply wait their turn.
export async function runWithConcurrencyLimit<T>(
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

// Uploads every remaining chunk of `file`, skipping any part number already
// present in `completedParts` (resume). Up to PART_UPLOAD_CONCURRENCY parts
// run at once (see runWithConcurrencyLimit) rather than one at a time — R2/S3
// multipart uploads don't require parts to land in order, only that the
// final list handed to CompleteMultipartUpload is sorted by PartNumber,
// which is why `parts` below is a pre-sized array written by index rather
// than a push (a push would silently reorder the list under concurrency).
// Calls `onProgress` after every part (completed or skipped) with the
// running byte count — tracked via shared counters since parts can now
// finish in any order, not assumed to arrive sequentially.
//
// `signal` is optional and purely additive — every existing caller that
// doesn't pass one keeps working exactly as before. Passing one lets a
// caller cancel mid-upload (checked before each chunk, and threaded into the
// in-flight PUT itself so a cancel takes effect immediately rather than
// waiting for the current chunk to finish).
export async function uploadFileInChunks(
  file: File,
  presignedUrls: string[],
  completedParts: PartRecord[],
  onProgress?: (uploadedBytes: number, partsDone: number, partCount: number) => void,
  signal?: AbortSignal,
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
      if (signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError')
      const partNumber = i + 1
      const partSize = Math.min(CHUNK_SIZE, file.size - i * CHUNK_SIZE)
      const already = completedParts.find((p) => p.PartNumber === partNumber)
      if (already) {
        parts[i] = already
      } else {
        const chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
        const etag = await uploadPartWithRetry(presignedUrls[i], chunk, signal)
        parts[i] = { PartNumber: partNumber, ETag: etag }
      }
      uploadedBytes += partSize
      partsDone += 1
      onProgress?.(Math.min(uploadedBytes, file.size), partsDone, partCount)
    }
  )

  return parts
}
