import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminJWT } from '@/lib/adminAuth'
import { getItem } from '@/lib/aws/dynamodb'
import { deleteR2Object } from '@/lib/aws/r2'
import { getCachedR2Orphans, applyOrphanCleanup } from '@/lib/platformStats'
import { logAudit } from '@/lib/audit'
import type { ApiResponse, Transfer, TransferFile } from '@/types'
import type { OrphanUserGroup } from '@/lib/r2Orphans'

const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
const TRANSFER_FILES_TABLE = process.env.DYNAMO_TRANSFER_FILES_TABLE ?? 'vayu-transfer-files'

// Vercel's serverless functions here run on the default (Hobby) timeout —
// ~10s, no maxDuration override anywhere in this app. Deleting a few
// hundred files sequentially in one request, then following it with a full
// bucket re-scan, blew straight past that in production (272 files, killed
// mid-flight, nothing persisted since the cache-refresh step never ran).
// Fix: bounded batch per call + bounded concurrency within the batch + a
// cheap in-place cache patch instead of a full re-sync. The client
// (app/admin/storage-orphans/page.tsx) calls this repeatedly, using the
// returned `remaining` count, until it hits 0.
const BATCH_SIZE = 60
const CONCURRENCY = 12

type DeleteTarget = { target: 'user'; walletId: string } | { target: 'unknown' } | { target: 'all' }

// Re-derives a key's current owner and status LIVE (cheap getItems, not
// another full bucket scan) right before deleting — the cached orphan list
// this endpoint reads from could be from a sync that ran a while ago;
// this is the actual safety gate, not the cache. Mirrors lib/r2Orphans.ts's
// classification exactly, just per-key instead of over a full scan.
async function reverifyAndDelete(key: string): Promise<'deleted' | 'skipped'> {
  const segments = key.split('/')

  if (segments.length >= 3) {
    const fileId = segments[1]
    const transfer = await getItem<Transfer>(TRANSFERS_TABLE, { fileId })
    if (transfer && transfer.r2Key === key) {
      if (transfer.status === 'failed' || transfer.status === 'deleted') {
        await deleteR2Object(key)
        return 'deleted'
      }
      return 'skipped' // active/pending/expired — still needed, never touch
    }
  }

  if (segments.length >= 4) {
    const batchId = segments[1]
    const fileId = segments[2]
    const tf = await getItem<TransferFile>(TRANSFER_FILES_TABLE, { batchId, fileId })
    if (tf && tf.r2Key === key) {
      const parent = await getItem<Transfer>(TRANSFERS_TABLE, { fileId: batchId })
      const parentTerminal = !parent || parent.status === 'failed' || parent.status === 'deleted'
      const fileFailed = tf.status === 'failed'
      if (parentTerminal || fileFailed) {
        await deleteR2Object(key)
        return 'deleted'
      }
      return 'skipped'
    }
  }

  // No matching record at all, live — untraceable, safe to delete per policy.
  await deleteR2Object(key)
  return 'deleted'
}

async function runWithConcurrencyLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const runNext = async (): Promise<void> => {
    const i = next++
    if (i >= items.length) return
    await worker(items[i])
    return runNext()
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runNext()))
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdminJWT(req)
  if (!auth) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  try {
    const body = await req.json() as DeleteTarget
    const cached = await getCachedR2Orphans()
    if (!cached) {
      return NextResponse.json<ApiResponse<never>>({ success: false, error: 'NOT_FOUND', message: 'No orphan scan found — click Sync Now first' }, { status: 404 })
    }

    const matchesTarget = (g: OrphanUserGroup) =>
      body.target === 'all' ? true : body.target === 'unknown' ? g.walletId === null : g.walletId === body.walletId

    const targetKeys = cached.groups
      .filter(matchesTarget)
      .flatMap((g) => g.objects.map((o) => ({ key: o.key, size: o.size, walletId: g.walletId })))

    const batch = targetKeys.slice(0, BATCH_SIZE)

    let deleted = 0
    let skipped = 0
    let bytesFreed = 0
    const removeFromCache = new Set<string>() // deleted, or no longer actually orphaned (reverify says still needed)
    const walletUsageDeltas: Record<string, number> = {}

    await runWithConcurrencyLimit(batch, CONCURRENCY, async (item) => {
      try {
        const outcome = await reverifyAndDelete(item.key)
        if (outcome === 'deleted') {
          deleted++
          bytesFreed += item.size
          removeFromCache.add(item.key)
          if (item.walletId) walletUsageDeltas[item.walletId] = (walletUsageDeltas[item.walletId] ?? 0) + item.size
        } else {
          // No longer a valid orphan (status changed since the scan) — drop
          // it from the cached list too so it stops showing up, but it
          // wasn't actually deleted so it doesn't count toward bytesFreed.
          skipped++
          removeFromCache.add(item.key)
        }
      } catch (err) {
        console.error('[admin/storage-orphans/delete] failed for', item.key, err)
        // Left in the cache — will be retried on the next batch/sync.
      }
    })

    const updatedGroups = cached.groups
      .map((g) => ({ ...g, objects: g.objects.filter((o) => !removeFromCache.has(o.key)) }))
      .map((g) => ({ ...g, totalBytes: g.objects.reduce((s, o) => s + o.size, 0) }))
      .filter((g) => g.objects.length > 0)

    await applyOrphanCleanup({
      updatedGroups,
      totalBytesFreed: bytesFreed,
      totalCountFreed: deleted,
      walletUsageDeltas,
    })

    const remaining = updatedGroups.filter(matchesTarget).reduce((s, g) => s + g.objects.length, 0)

    void logAudit({
      eventType: 'TRANSFER_DELETED',
      actor: 'admin',
      outcome: 'success',
      metadata: { adminAction: true, reason: 'ORPHAN_STORAGE_CLEANUP', target: body, deleted, skipped, bytesFreed, remaining },
    })

    return NextResponse.json<ApiResponse<{ deleted: number; skipped: number; bytesFreed: number; remaining: number }>>({
      success: true,
      data: { deleted, skipped, bytesFreed, remaining },
    })
  } catch (err) {
    console.error('[admin/storage-orphans/delete]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to delete orphaned files' },
      { status: 500 }
    )
  }
}
