import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminJWT } from '@/lib/adminAuth'
import { getItem } from '@/lib/aws/dynamodb'
import { deleteR2Object } from '@/lib/aws/r2'
import { getCachedR2Orphans, syncR2Stats } from '@/lib/platformStats'
import { logAudit } from '@/lib/audit'
import type { ApiResponse, Transfer, TransferFile } from '@/types'

const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
const TRANSFER_FILES_TABLE = process.env.DYNAMO_TRANSFER_FILES_TABLE ?? 'vayu-transfer-files'

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

    const groups = body.target === 'all'
      ? cached.groups
      : body.target === 'unknown'
        ? cached.groups.filter((g) => g.walletId === null)
        : cached.groups.filter((g) => g.walletId === body.walletId)

    const keys = groups.flatMap((g) => g.objects.map((o) => o.key))

    let deleted = 0
    let skipped = 0
    let bytesFreed = 0
    const keyBySize = new Map(groups.flatMap((g) => g.objects.map((o) => [o.key, o.size] as const)))

    for (const key of keys) {
      try {
        const outcome = await reverifyAndDelete(key)
        if (outcome === 'deleted') {
          deleted++
          bytesFreed += keyBySize.get(key) ?? 0
        } else {
          skipped++
        }
      } catch (err) {
        console.error('[admin/storage-orphans/delete] failed for', key, err)
        skipped++
      }
    }

    // Refresh the cache so the dashboard reflects the cleanup immediately —
    // same full-scan cost as a manual "Sync Now" click.
    await syncR2Stats()

    void logAudit({
      eventType: 'TRANSFER_DELETED',
      actor: 'admin',
      outcome: 'success',
      metadata: { adminAction: true, reason: 'ORPHAN_STORAGE_CLEANUP', target: body, deleted, skipped, bytesFreed },
    })

    return NextResponse.json<ApiResponse<{ deleted: number; skipped: number; bytesFreed: number }>>({
      success: true,
      data: { deleted, skipped, bytesFreed },
    })
  } catch (err) {
    console.error('[admin/storage-orphans/delete]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to delete orphaned files' },
      { status: 500 }
    )
  }
}
