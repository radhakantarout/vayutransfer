// Client-side helpers for resuming an interrupted studio photo upload.
// Keyed by filename+size+lastModified rather than fileId, since that's the
// only thing that survives a browser refresh — a File object reference
// itself doesn't persist, so resuming requires the user to re-select the
// same file, at which point we recognize it and pick up where it left off
// instead of restarting the whole multipart upload from part 1.

export interface UploadResumeEntry {
  projectId: string
  fileId: string
  uploadId: string
  filename: string
  size: number
  lastModified: number
}

function resumeKey(projectId: string, filename: string, size: number, lastModified: number): string {
  return `vayu_studio_upload_resume_${projectId}_${filename}_${size}_${lastModified}`
}

export function saveUploadResume(entry: UploadResumeEntry): void {
  try {
    localStorage.setItem(
      resumeKey(entry.projectId, entry.filename, entry.size, entry.lastModified),
      JSON.stringify(entry)
    )
  } catch {
    // localStorage unavailable (private browsing, quota, etc.) — resume
    // simply won't be offered next time, upload itself is unaffected.
  }
}

export function loadUploadResume(
  projectId: string,
  filename: string,
  size: number,
  lastModified: number
): UploadResumeEntry | null {
  try {
    const raw = localStorage.getItem(resumeKey(projectId, filename, size, lastModified))
    return raw ? (JSON.parse(raw) as UploadResumeEntry) : null
  } catch {
    return null
  }
}

export function clearUploadResume(
  projectId: string,
  filename: string,
  size: number,
  lastModified: number
): void {
  try {
    localStorage.removeItem(resumeKey(projectId, filename, size, lastModified))
  } catch {
    // no-op
  }
}
