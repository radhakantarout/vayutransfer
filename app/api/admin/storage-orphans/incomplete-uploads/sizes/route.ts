import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminJWT } from '@/lib/adminAuth'
import { sumR2IncompletePartBytes } from '@/lib/aws/r2'
import type { ApiResponse } from '@/types'

// Stateless — no DynamoDB read/write at all (see the parent route's comment
// on why nothing about incomplete uploads gets cached). The client already
// has the full item list from its own GET call and drives the batching
// itself, sending one bounded chunk of {key, uploadId} pairs per call;
// this just runs ListParts for each and hands back the byte totals. Admin-
// gated, read-only against R2 (ListPartsCommand), so trusting the client's
// key/uploadId pairs carries no real risk beyond wasted API calls.
const CONCURRENCY = 12
const MAX_ITEMS_PER_CALL = 80

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
    const body = await req.json() as { items?: { key: string; uploadId: string }[] }
    const items = (body.items ?? []).slice(0, MAX_ITEMS_PER_CALL)

    const sizes: { uploadId: string; sizeBytes: number }[] = []
    await runWithConcurrencyLimit(items, CONCURRENCY, async (item) => {
      try {
        const sizeBytes = await sumR2IncompletePartBytes(item.key, item.uploadId)
        sizes.push({ uploadId: item.uploadId, sizeBytes })
      } catch (err) {
        console.error('[incomplete-uploads/sizes] failed for', item.key, err)
      }
    })

    return NextResponse.json<ApiResponse<{ sizes: { uploadId: string; sizeBytes: number }[] }>>({
      success: true,
      data: { sizes },
    })
  } catch (err) {
    console.error('[admin/storage-orphans/incomplete-uploads/sizes]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to compute incomplete upload sizes' },
      { status: 500 }
    )
  }
}
