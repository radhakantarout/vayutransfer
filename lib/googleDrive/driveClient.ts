import { google } from 'googleapis'
import { getDriveAccessToken } from '@/lib/googleDrive/oauth'

// Workspace-native types have no real file bytes — they must be exported
// through Drive's export endpoint instead of downloaded. Anything not
// listed here (Forms, Apps Script, Sites, etc.) has no sensible exported
// file and is reported to the caller as unsupported rather than silently
// mishandled.
const WORKSPACE_EXPORT_MAP: Record<string, { mimeType: string; extension: string }> = {
  'application/vnd.google-apps.document': { mimeType: 'application/pdf', extension: '.pdf' },
  'application/vnd.google-apps.spreadsheet': { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: '.xlsx' },
  'application/vnd.google-apps.presentation': { mimeType: 'application/pdf', extension: '.pdf' },
  'application/vnd.google-apps.drawing': { mimeType: 'image/png', extension: '.png' },
}

export const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'

export function isWorkspaceFile(mimeType: string): boolean {
  return mimeType.startsWith('application/vnd.google-apps.') && mimeType !== DRIVE_FOLDER_MIME_TYPE
}

export function getWorkspaceExport(mimeType: string): { mimeType: string; extension: string } | null {
  return WORKSPACE_EXPORT_MAP[mimeType] ?? null
}

export interface DriveFileMeta {
  id: string
  name: string
  mimeType: string
  sizeBytes: number   // 0 for Workspace files — real size isn't known until export
  isFolder: boolean
}

// Raw folder-walk result — distinct from the client-safe, post-resolution
// `DriveFileEntry` in @/types (which also carries export-mimetype info and
// is safe to import in browser code). This one is internal to the Drive
// lib's server-only pipeline.
export interface RawDriveFileEntry extends DriveFileMeta {
  relativePath: string
}

async function driveClientForUser(userId: string) {
  const accessToken = await getDriveAccessToken(userId)
  if (!accessToken) throw new Error('DRIVE_NOT_CONNECTED')
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  return google.drive({ version: 'v3', auth })
}

// The one real security boundary: re-fetches this exact file ID through
// the user's own authorized Drive client. With drive.file scope, Google
// itself returns 404 for any ID the app was never granted access to via
// Picker — there is no way to reach another user's file by guessing an
// ID, the API call itself fails closed. Never trust a client-supplied
// name/size/mimeType — this is the only place those values may come from.
export async function verifyAndGetFileMetadata(userId: string, fileId: string): Promise<DriveFileMeta | null> {
  const drive = await driveClientForUser(userId)
  try {
    const res = await drive.files.get({
      fileId,
      fields: 'id,name,mimeType,size,trashed',
    })
    if (res.data.trashed) return null
    const mimeType = res.data.mimeType ?? 'application/octet-stream'
    return {
      id: res.data.id!,
      name: res.data.name ?? 'untitled',
      mimeType,
      sizeBytes: res.data.size ? parseInt(res.data.size, 10) : 0,
      isFolder: mimeType === DRIVE_FOLDER_MIME_TYPE,
    }
  } catch {
    return null
  }
}

// Recursively expands a folder's contents, capped so a single import can't
// turn into an unbounded crawl. Since access is scoped by drive.file to
// exactly the folder(s) the user picked via Picker, this can never wander
// into unrelated Drive content — Google's API itself enforces that
// boundary, this cap just protects against a single pathologically large
// folder.
const MAX_FOLDER_FILES = 2000

// Sibling subfolders are walked with this many concurrent `files.list`
// calls in flight at once, rather than one at a time — a folder tree with
// many subfolders used to chain every subfolder's round trip sequentially
// (a 30-subfolder album could take 30x one request's latency), which made
// the picker feel hung. Capped rather than unbounded `Promise.all` to
// avoid bursting past Drive's per-user rate limit on a very wide tree.
const FOLDER_WALK_CONCURRENCY = 6

async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const item = items[next++]
      await fn(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

export async function listFolderRecursive(userId: string, rootFolderId: string, rootFolderName: string): Promise<RawDriveFileEntry[]> {
  const drive = await driveClientForUser(userId)
  const results: RawDriveFileEntry[] = []

  async function walk(folderId: string, basePath: string): Promise<void> {
    const subFolders: { id: string; path: string }[] = []
    let pageToken: string | undefined
    do {
      if (results.length >= MAX_FOLDER_FILES) return
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id,name,mimeType,size)',
        pageSize: 200,
        pageToken,
      })
      for (const f of res.data.files ?? []) {
        if (results.length >= MAX_FOLDER_FILES) return
        const mimeType = f.mimeType ?? 'application/octet-stream'
        const isFolder = mimeType === DRIVE_FOLDER_MIME_TYPE
        const relativePath = `${basePath}${f.name}`
        if (isFolder) {
          subFolders.push({ id: f.id!, path: `${relativePath}/` })
        } else {
          results.push({
            id: f.id!,
            name: f.name ?? 'untitled',
            mimeType,
            sizeBytes: f.size ? parseInt(f.size, 10) : 0,
            isFolder: false,
            relativePath,
          })
        }
      }
      pageToken = res.data.nextPageToken ?? undefined
    } while (pageToken)

    await mapWithConcurrency(subFolders, FOLDER_WALK_CONCURRENCY, (sub) => walk(sub.id, sub.path))
  }

  await walk(rootFolderId, `${rootFolderName}/`)
  return results
}

// Re-verifies the file the same way verifyAndGetFileMetadata does (fails
// closed under drive.file scope for anything not picked through this app),
// then proxies Drive's own thumbnail bytes through our server — thumbnailLink
// requires the same OAuth bearer token we hold server-side, so the browser
// can never load it directly as a plain <img src>.
export async function getFileThumbnail(userId: string, fileId: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const accessToken = await getDriveAccessToken(userId)
  if (!accessToken) return null
  const drive = await driveClientForUser(userId)
  const meta = await drive.files.get({ fileId, fields: 'thumbnailLink,trashed' }).catch(() => null)
  if (!meta || meta.data.trashed || !meta.data.thumbnailLink) return null

  const res = await fetch(meta.data.thumbnailLink, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) return null
  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') ?? 'image/jpeg'
  return { buffer, contentType }
}
