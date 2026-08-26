import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminJWT } from '@/lib/adminAuth'
import { abortR2MultipartUpload } from '@/lib/aws/r2'
import { classifyR2IncompleteUploads, isEligibleToAbort } from '@/lib/r2IncompleteUploads'
import { logAudit } from '@/lib/audit'
import type { ApiResponse } from '@/types'
import type { IncompleteUploadUserGroup } from '@/lib/r2IncompleteUploads'

// No cache to read from (see the parent route's comment — persisting this
// list in DynamoDB isn't viable, uploadIds are ~340 chars each). Instead
// this re-derives the current live list itself on every call — cheap
// (ListMultipartUploads has no per-item cost, only the 3 DB scans repeat),
// which also means eligibility is always checked against fresh data, no
// staleness window to worry about. Same batched/resumable/bounded-
// concurrency shape as storage-orphans/delete for the abort work itself.
const BATCH_SIZE = 60
const CONCURRENCY = 12

type AbortTarget = { target: 'user'; walletId: string } | { target: 'unknown' } | { target: 'all' }

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
    const body = await req.json() as AbortTarget
    const { groups } = await classifyR2IncompleteUploads()

    const matchesTarget = (g: IncompleteUploadUserGroup) =>
      body.target === 'all' ? true : body.target === 'unknown' ? g.walletId === null : g.walletId === body.walletId

    const eligible = groups
      .filter(matchesTarget)
      .flatMap((g) => g.items.filter((i) => isEligibleToAbort(i.status, i.initiated)))

    const batch = eligible.slice(0, BATCH_SIZE)

    let aborted = 0
    let failed = 0

    await runWithConcurrencyLimit(batch, CONCURRENCY, async (item) => {
      try {
        await abortR2MultipartUpload(item.key, item.uploadId)
        aborted++
      } catch (err) {
        console.error('[incomplete-uploads/abort] failed for', item.key, err)
        failed++
      }
    })

    const remaining = eligible.length - batch.length

    void logAudit({
      eventType: 'TRANSFER_DELETED',
      actor: 'admin',
      outcome: 'success',
      metadata: { adminAction: true, reason: 'INCOMPLETE_MULTIPART_ABORT', target: body, aborted, failed, remaining },
    })

    return NextResponse.json<ApiResponse<{ aborted: number; failed: number; remaining: number }>>({
      success: true,
      data: { aborted, failed, remaining: Math.max(0, remaining) },
    })
  } catch (err) {
    console.error('[admin/storage-orphans/incomplete-uploads/abort]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to abort incomplete uploads' },
      { status: 500 }
    )
  }
}
