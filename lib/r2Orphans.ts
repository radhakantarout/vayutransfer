// Identifies real R2 objects that no longer correspond to anything the
// database still needs — see the interrupted-upload/orphan-storage plan
// for the full "why": several abort code paths mark a transfer 'failed'
// without ever deleting files that had already fully uploaded, and the
// DELETE routes' own object-cleanup is best-effort, so failures there
// leave a 'deleted' record with a real object still sitting in R2.
//
// Safety rule (deliberately conservative): an object is only ever
// classified as orphaned if its owning record is explicitly 'failed' or
// 'deleted', or if it doesn't match ANY database record at all. 'active',
// 'pending', and 'expired' transfers are never touched, no matter how old.

import { scanAll } from '@/lib/aws/dynamodb'
import { listR2BucketObjects } from '@/lib/aws/r2'
import type { Transfer, TransferFile } from '@/types'
import type { User } from '@/lib/users'

const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
const TRANSFER_FILES_TABLE = process.env.DYNAMO_TRANSFER_FILES_TABLE ?? 'vayu-transfer-files'
const USERS_TABLE = process.env.DYNAMO_USERS_TABLE ?? 'vayu-users'

export interface OrphanObject {
  key: string
  size: number
  fileName: string
  formerStatus: string
}

export interface OrphanUserGroup {
  walletId: string | null // null = no traceable owner at all
  name: string
  email: string
  totalBytes: number
  objects: OrphanObject[]
}

export interface R2Reconciliation {
  totalObjects: number
  totalBytes: number
  groups: OrphanUserGroup[]
}

// One full bucket listing produces both the aggregate totals (what used to
// be listR2BucketStats' whole job) and the orphan breakdown — avoids paying
// for two separate full-bucket scans on every "Sync Now" click.
export async function classifyR2Orphans(): Promise<R2Reconciliation> {
  const [objects, transfers, transferFiles, users] = await Promise.all([
    listR2BucketObjects(),
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

  // walletId -> accumulator; null-key bucket holds fully untraceable objects
  const groups = new Map<string | null, OrphanObject[]>()
  const addOrphan = (walletId: string | null, obj: OrphanObject) => {
    const list = groups.get(walletId)
    if (list) list.push(obj)
    else groups.set(walletId, [obj])
  }

  for (const { key, size } of objects) {
    const singleFileMatch = transfersByKey.get(key)
    if (singleFileMatch) {
      if (singleFileMatch.status === 'failed' || singleFileMatch.status === 'deleted') {
        addOrphan(singleFileMatch.walletId, { key, size, fileName: singleFileMatch.fileName, formerStatus: singleFileMatch.status })
      }
      continue // needed (active/pending/expired) — never touched
    }

    const batchFileMatch = transferFilesByKey.get(key)
    if (batchFileMatch) {
      const parent = transfersById.get(batchFileMatch.batchId)
      if (!parent) continue // can't prove it's safe — leave it alone
      if (parent.status === 'failed' || parent.status === 'deleted') {
        addOrphan(parent.walletId, { key, size, fileName: batchFileMatch.fileName, formerStatus: parent.status })
      } else if (batchFileMatch.status === 'failed') {
        addOrphan(parent.walletId, { key, size, fileName: batchFileMatch.fileName, formerStatus: 'failed' })
      }
      continue
    }

    // No matching record at all — fully untraceable.
    addOrphan(null, { key, size, fileName: key.split('/').pop() || key, formerStatus: 'untraceable' })
  }

  const result: OrphanUserGroup[] = []
  for (const [walletId, objs] of Array.from(groups.entries())) {
    const user = walletId ? userByWalletId.get(walletId) : undefined
    result.push({
      walletId,
      name: user?.name ?? (walletId ? 'Unknown user' : 'No traceable owner'),
      email: user?.email ?? (walletId ?? '—'),
      totalBytes: objs.reduce((s, o) => s + o.size, 0),
      objects: objs,
    })
  }
  result.sort((a, b) => b.totalBytes - a.totalBytes)

  return {
    totalObjects: objects.length,
    totalBytes: objects.reduce((s, o) => s + o.size, 0),
    groups: result,
  }
}
