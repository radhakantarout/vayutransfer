// Identifies incomplete multipart uploads sitting in the R2 transfer
// bucket — parts already uploaded (real, billed bytes) for an upload that
// was never completed OR aborted. These are invisible to ListObjectsV2 (see
// lib/aws/r2.ts#listR2IncompleteMultipartUploads), so they never show up in
// the platform dashboard's "Actually in R2" stat or in lib/r2Orphans.ts's
// classification — but Cloudflare's own bucket-size UI counts them, which
// is why that number can run far ahead of what this app otherwise tracks.
//
// R2-only: S3 hasn't taken a new upload since the Phase 5 R2 migration, so
// any legacy S3 multipart upload would already be long past R2/S3's own
// abort lifecycle rules by now — same scoping decision lib/r2Orphans.ts
// already made for orphan detection.
//
// Safety rule for aborting (mirrors lib/r2Orphans.ts's orphan policy
// exactly): an incomplete upload is only ever eligible to abort if its
// owning record is explicitly 'failed'/'deleted' (that upload session is
// definitively over, regardless of age), OR it's untraceable/still
// 'pending' AND initiated more than STALE_THRESHOLD_HOURS ago (matching
// the reconcile-uploads cron's own generous window for a legitimately slow
// large upload). 'active'/'expired' should never occur for an incomplete
// upload at all (an 'active' transfer implies CompleteMultipartUpload
// already succeeded) but are excluded defensively.

import { scanAll } from '@/lib/aws/dynamodb'
import { listR2IncompleteMultipartUploads } from '@/lib/aws/r2'
import type { Transfer, TransferFile } from '@/types'
import type { User } from '@/lib/users'

const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
const TRANSFER_FILES_TABLE = process.env.DYNAMO_TRANSFER_FILES_TABLE ?? 'vayu-transfer-files'
const USERS_TABLE = process.env.DYNAMO_USERS_TABLE ?? 'vayu-users'

export const STALE_THRESHOLD_HOURS = 6

export interface IncompleteUploadItem {
  key: string
  uploadId: string
  initiated: string
  fileName: string
  status: string // 'failed' | 'deleted' | 'pending' | 'untraceable' | other
  sizeBytes: number | null // null until computed (see the /sizes route)
}

export interface IncompleteUploadUserGroup {
  walletId: string | null
  name: string
  email: string
  items: IncompleteUploadItem[]
}

export function isEligibleToAbort(status: string, initiated: string): boolean {
  if (status === 'failed' || status === 'deleted') return true
  const ageMs = Date.now() - new Date(initiated).getTime()
  return ageMs > STALE_THRESHOLD_HOURS * 60 * 60 * 1000
}

export async function classifyR2IncompleteUploads(): Promise<{ groups: IncompleteUploadUserGroup[]; totalCount: number }> {
  const [uploads, transfers, transferFiles, users] = await Promise.all([
    listR2IncompleteMultipartUploads(),
    scanAll<Transfer>(TRANSFERS_TABLE),
    scanAll<TransferFile>(TRANSFER_FILES_TABLE),
    scanAll<User>(USERS_TABLE),
  ])

  const transfersByKey = new Map<string, Transfer>()
  const transfersById = new Map<string, Transfer>()
  for (const t of transfers) {
    transfersById.set(t.fileId, t)
    if (t.storageBackend === 'R2' && t.r2Key) transfersByKey.set(t.r2Key, t)
  }
  const transferFilesByKey = new Map<string, TransferFile>()
  for (const f of transferFiles) {
    if (f.storageBackend === 'R2' && f.r2Key) transferFilesByKey.set(f.r2Key, f)
  }
  const userByWalletId = new Map<string, User>()
  for (const u of users) userByWalletId.set(u.walletId, u)

  const groups = new Map<string | null, IncompleteUploadItem[]>()
  const addItem = (walletId: string | null, item: IncompleteUploadItem) => {
    const list = groups.get(walletId)
    if (list) list.push(item)
    else groups.set(walletId, [item])
  }

  for (const u of uploads) {
    const single = transfersByKey.get(u.key)
    if (single) {
      addItem(single.walletId, { key: u.key, uploadId: u.uploadId, initiated: u.initiated, fileName: single.fileName, status: single.status, sizeBytes: null })
      continue
    }

    const batchFile = transferFilesByKey.get(u.key)
    if (batchFile) {
      const parent = transfersById.get(batchFile.batchId)
      const status = parent ? (parent.status === 'failed' || parent.status === 'deleted' ? parent.status : batchFile.status) : 'untraceable'
      addItem(parent?.walletId ?? null, { key: u.key, uploadId: u.uploadId, initiated: u.initiated, fileName: batchFile.fileName, status, sizeBytes: null })
      continue
    }

    addItem(null, { key: u.key, uploadId: u.uploadId, initiated: u.initiated, fileName: u.key.split('/').pop() || u.key, status: 'untraceable', sizeBytes: null })
  }

  const result: IncompleteUploadUserGroup[] = []
  for (const [walletId, items] of Array.from(groups.entries())) {
    const user = walletId ? userByWalletId.get(walletId) : undefined
    result.push({
      walletId,
      name: user?.name ?? (walletId ? 'Unknown user' : 'No traceable owner'),
      email: user?.email ?? (walletId ?? '—'),
      items,
    })
  }
  result.sort((a, b) => b.items.length - a.items.length)

  return { groups: result, totalCount: uploads.length }
}
