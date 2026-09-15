// Single dispatch point for "which backend is this file actually on" — every
// route calls these instead of importing lib/studio/s3.ts or lib/studio/r2.ts
// directly and branching on storageBackend itself. Keeps the S3<->R2 migration
// mechanical: old S3 files keep working untouched, new R2 files just work,
// and there's exactly one place that knows how to tell them apart.
import * as s3 from './s3'
import * as r2 from './r2'

interface StorageFile {
  fileType: string
  // Exactly one of s3Key/r2Key is always set — never neither, never both.
  s3Key?: string
  editedS3Key?: string
  r2Key?: string
  editedR2Key?: string
  r2PreviewUrl?: string
  videoThumbnailUrl?: string
}

type Backend = 'S3' | 'R2'

// The edited copy's backend is inferred independently from the original's:
// an edit uploaded after the R2 cutover lands on R2 (editedR2Key set) even if
// the original file predates the migration and is still on S3.
function resolveCurrent(file: StorageFile): { key: string; backend: Backend } {
  if (file.editedR2Key) return { key: file.editedR2Key, backend: 'R2' }
  if (file.editedS3Key) return { key: file.editedS3Key, backend: 'S3' }
  if (file.r2Key)       return { key: file.r2Key,       backend: 'R2' }
  return { key: file.s3Key!, backend: 'S3' }
}

// Ignores any edited copy — used by the "Download Original" control, which
// must give back the pristine file regardless of what's been edited since.
function resolveOriginal(file: StorageFile): { key: string; backend: Backend } {
  if (file.r2Key) return { key: file.r2Key, backend: 'R2' }
  return { key: file.s3Key!, backend: 'S3' }
}

export async function getMediaDownloadUrl(
  file: StorageFile,
  filename: string,
  opts?: { original?: boolean; expiresInSeconds?: number }
): Promise<string> {
  const { key, backend } = opts?.original ? resolveOriginal(file) : resolveCurrent(file)
  return backend === 'R2'
    ? r2.getStudioR2SignedDownloadUrl(key, filename, opts?.expiresInSeconds)
    : s3.getStudioSignedDownloadUrl(key, filename, opts?.expiresInSeconds)
}

// r2PreviewUrl is the Lambda-written preview — for IMAGE it's the
// watermarked copy, for VIDEO it's the transcoded H.264/AAC mp4
// (lambda/vayustudio-vidtranscode). Trustworthy once set, regardless of
// which backend the source file is on (the Lambda re-runs and overwrites
// this same preview on every edit re-upload).
//
// The raw-signed-URL fallback below is only safe for IMAGE: a raw upload is
// still a directly-viewable JPEG/PNG. For VIDEO, the raw upload is very
// often HEVC-in-.mov straight off an iPhone, which most browsers cannot
// decode at all — serving it as a "preview" doesn't just look wrong, the
// <video> element throws decode errors that read as a crash to the user.
// So a video with no r2PreviewUrl yet (still transcoding, transcode failed,
// or an old record from before this pipeline existed) must report "no
// preview" rather than the broken raw file — the UI already renders a
// processing/placeholder state for that, which is the correct outcome here.
export async function getMediaPreviewUrl(file: StorageFile): Promise<string | undefined> {
  if (file.r2PreviewUrl) return file.r2PreviewUrl
  if (file.fileType === 'VIDEO') return undefined
  const { key, backend } = resolveCurrent(file)
  try {
    return backend === 'R2' ? await r2.getStudioR2SignedViewUrl(key) : await s3.getStudioSignedViewUrl(key)
  } catch (err) {
    // Called once per file on every ~4s gallery poll — without this, a
    // systemic signing failure (expired creds, R2/S3 outage) looks
    // identical to "still processing" with nothing in the logs to tell
    // them apart.
    console.error('[getMediaPreviewUrl] signing failed for', key, err)
    return undefined
  }
}

// Used by the print portal's "download all" zip assembly.
export async function getMediaObjectBuffer(file: StorageFile): Promise<Buffer> {
  const { key, backend } = resolveCurrent(file)
  return backend === 'R2' ? r2.getStudioR2ObjectBuffer(key) : s3.getStudioObjectBuffer(key)
}

// Deletes BOTH the original and edited copy (whichever backend each is on),
// best-effort. Existing behavior only ever deleted the original — this also
// fixes that pre-existing gap (an edited file was never cleaned up on delete).
// The R2 key for a preview/thumbnail is fully recoverable from its own
// stored URL (always `${PREVIEW_BASE}/${r2Key}` — see the watermark/
// vidtranscode Lambdas) via the URL's path, with no separate DB field to
// keep in sync. Best-effort: if parsing ever fails, skip that object rather
// than throwing — matches this function's existing best-effort discipline.
function previewKeyFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
  } catch {
    return undefined
  }
}

// Deletes the original, edited copy, AND the Lambda-generated preview/video-
// thumbnail (whichever exist) — previously only the original was ever
// deleted, leaking the processed copy in the separate preview bucket for up
// to 20 days (relying solely on that bucket's own lifecycle rule).
export async function deleteMediaObjects(file: StorageFile): Promise<void> {
  const jobs: Promise<void>[] = []
  if (file.r2Key) jobs.push(r2.deleteStudioR2Object(file.r2Key))
  else jobs.push(s3.deleteStudioS3Object(file.s3Key!))

  if (file.editedR2Key) jobs.push(r2.deleteStudioR2Object(file.editedR2Key))
  else if (file.editedS3Key) jobs.push(s3.deleteStudioS3Object(file.editedS3Key))

  const previewKey = previewKeyFromUrl(file.r2PreviewUrl)
  if (previewKey) jobs.push(r2.deleteStudioR2PreviewObject(previewKey))
  const thumbKey = previewKeyFromUrl(file.videoThumbnailUrl)
  if (thumbKey) jobs.push(r2.deleteStudioR2PreviewObject(thumbKey))

  await Promise.all(jobs.map((p) => p.catch((e) => console.error('[storage delete]', e))))
}
