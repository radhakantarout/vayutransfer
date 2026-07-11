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

export type PartRecord = { PartNumber: number; ETag: string }

// Retries a transient network blip (common on slow connections) before
// giving up on this part — most failures resolve within 1-2 retries without
// the user ever needing to notice or manually resume.
export async function uploadPartWithRetry(url: string, chunk: Blob): Promise<string> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= MAX_PART_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { method: 'PUT', body: chunk, signal: AbortSignal.timeout(PART_UPLOAD_TIMEOUT_MS) })
      if (!res.ok) throw new Error(`Part upload failed: ${res.status}`)
      return res.headers.get('ETag') ?? ''
    } catch (err) {
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

// Uploads every remaining chunk of `file` in order, skipping any part number
// already present in `completedParts` (resume). Calls `onProgress` after
// every part (completed or skipped) with the running byte count.
export async function uploadFileInChunks(
  file: File,
  presignedUrls: string[],
  completedParts: PartRecord[],
  onProgress?: (uploadedBytes: number, partsDone: number, partCount: number) => void
): Promise<PartRecord[]> {
  const partCount = presignedUrls.length
  const parts: PartRecord[] = []

  for (let i = 0; i < partCount; i++) {
    const partNumber = i + 1
    const already = completedParts.find((p) => p.PartNumber === partNumber)
    if (already) {
      parts.push(already)
    } else {
      const chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
      const etag = await uploadPartWithRetry(presignedUrls[i], chunk)
      parts.push({ PartNumber: partNumber, ETag: etag })
    }
    onProgress?.(Math.min(parts.length * CHUNK_SIZE, file.size), parts.length, partCount)
  }

  return parts
}
