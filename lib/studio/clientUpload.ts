// Shared chunked-upload client logic. Used by the studio admin gallery
// upload flow (page.tsx / EventSection.tsx) and the Raw File Transfer flows
// (admin SEND, anonymous RECEIVE). Each caller fetches its own presigned
// URLs and any already-completed parts (for resume) — those endpoints differ
// per flow (JWT-header'd admin routes vs. token-in-path anonymous routes) —
// then hands off to uploadFileInChunks, which does the actual
// chunking/retry/progress work identically everywhere.

export const CHUNK_SIZE = 50 * 1024 * 1024
export const MAX_PART_RETRIES = 3

export type PartRecord = { PartNumber: number; ETag: string }

// Retries a transient network blip (common on slow connections) before
// giving up on this part — most failures resolve within 1-2 retries without
// the user ever needing to notice or manually resume.
export async function uploadPartWithRetry(url: string, chunk: Blob): Promise<string> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= MAX_PART_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { method: 'PUT', body: chunk })
      if (!res.ok) throw new Error(`Part upload failed: ${res.status}`)
      return res.headers.get('ETag') ?? ''
    } catch (err) {
      lastErr = err
      if (attempt < MAX_PART_RETRIES) await new Promise((r) => setTimeout(r, attempt * 1000))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Part upload failed')
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
