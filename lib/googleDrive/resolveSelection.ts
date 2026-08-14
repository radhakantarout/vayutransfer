import {
  verifyAndGetFileMetadata,
  listFolderRecursive,
  isWorkspaceFile,
  getWorkspaceExport,
  DRIVE_FOLDER_MIME_TYPE,
  type RawDriveFileEntry,
} from '@/lib/googleDrive/driveClient'
import type { DriveFileEntry } from '@/types'

// Drive never exposes a "predicted export size" for Workspace docs (Google
// Docs/Sheets/Slides) before the export actually runs — the real byte
// count is only known once the Lambda performs the export. Office
// documents are virtually always small relative to the app's 0.1GB
// pricing/rounding granularity, so a conservative flat estimate is used
// for pricing and storage accounting instead of inventing a post-hoc
// billing-correction flow. Documented here rather than silently assumed.
export const WORKSPACE_EXPORT_SIZE_ESTIMATE_BYTES = 10 * 1024 * 1024 // 10MB

// Re-exported for callers that previously imported the type under this
// name — same shape as @/types's DriveFileEntry, kept as an alias so
// resolveDriveSelection's return type reads naturally at its call sites.
export type ResolvedDriveFile = DriveFileEntry

function resolveEntry(entry: { id: string; name: string; mimeType: string; sizeBytes: number; relativePath: string }): DriveFileEntry | { unsupported: string } {
  if (isWorkspaceFile(entry.mimeType)) {
    const exp = getWorkspaceExport(entry.mimeType)
    if (!exp) return { unsupported: entry.name }
    const baseName = entry.relativePath.replace(/\.[^./]*$/, '')
    return {
      driveFileId: entry.id,
      name: `${entry.name}${exp.extension}`,
      relativePath: `${baseName}${exp.extension}`,
      sizeBytes: WORKSPACE_EXPORT_SIZE_ESTIMATE_BYTES,
      mimeType: entry.mimeType,
      isWorkspaceExport: true,
      exportMimeType: exp.mimeType,
    }
  }
  return {
    driveFileId: entry.id,
    name: entry.name,
    relativePath: entry.relativePath,
    sizeBytes: entry.sizeBytes,
    mimeType: entry.mimeType,
    isWorkspaceExport: false,
  }
}

// Re-verifies every picked item through the user's own authorized Drive
// client (never trusts client-supplied size/name/mimeType), expanding any
// folders recursively. Called independently by BOTH /api/google-drive/list
// (preview/pricing) and /api/google-drive/import (the actual money-
// spending step) — the import route does NOT trust a client-echoed file
// list from the earlier /list call, it re-resolves from scratch, since
// only server-verified data may ever influence what gets deducted from a
// wallet.
export async function resolveDriveSelection(
  userId: string,
  items: { id: string; mimeType: string }[]
): Promise<{ files: DriveFileEntry[]; totalSizeBytes: number; unsupported: string[] }> {
  const resolved: DriveFileEntry[] = []
  const unsupported: string[] = []

  for (const item of items) {
    if (item.mimeType === DRIVE_FOLDER_MIME_TYPE) {
      const meta = await verifyAndGetFileMetadata(userId, item.id)
      if (!meta || !meta.isFolder) continue
      const entries: RawDriveFileEntry[] = await listFolderRecursive(userId, item.id, meta.name)
      for (const e of entries) {
        const r = resolveEntry(e)
        if ('unsupported' in r) unsupported.push(r.unsupported)
        else resolved.push(r)
      }
    } else {
      const meta = await verifyAndGetFileMetadata(userId, item.id)
      if (!meta) continue
      const r = resolveEntry({ id: meta.id, name: meta.name, mimeType: meta.mimeType, sizeBytes: meta.sizeBytes, relativePath: meta.name })
      if ('unsupported' in r) unsupported.push(r.unsupported)
      else resolved.push(r)
    }
  }

  const totalSizeBytes = resolved.reduce((sum, f) => sum + f.sizeBytes, 0)
  return { files: resolved, totalSizeBytes, unsupported }
}
