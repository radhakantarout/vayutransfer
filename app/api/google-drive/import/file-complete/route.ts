import { NextRequest, NextResponse } from 'next/server'
import { updateItem } from '@/lib/aws/dynamodb'
import { finalizeBatchIfComplete, updateTransferFileStatus } from '@/lib/transferBatch'
import { logAudit } from '@/lib/audit'
import type { ApiResponse } from '@/types'

const DRIVE_JOBS_TABLE = process.env.DYNAMO_DRIVE_JOBS_TABLE ?? 'vayu-drive-jobs'

// Server-to-server callback from lambda/vayu-drive-import — never reachable
// from the browser. Authenticated with a shared secret (not a user
// session, the Lambda has no user context) rather than left public.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret')
  if (!secret || secret !== process.env.GOOGLE_DRIVE_INTERNAL_SECRET) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'UNAUTHORIZED', message: 'Unauthorized' },
      { status: 401 }
    )
  }

  const body = await req.json() as {
    jobId?: string
    batchId?: string
    fileId?: string
    walletId?: string
    status?: 'uploaded' | 'failed'
    errorMessage?: string
    processed?: number
    total?: number
    currentFileName?: string
  }
  const { jobId, batchId, fileId, walletId, status } = body
  if (!jobId || !batchId || !fileId || !walletId || !status) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'MISSING_PARAMS', message: 'jobId, batchId, fileId, walletId, status are required' },
      { status: 400 }
    )
  }

  try {
    // Progress update on the job row — always applied regardless of
    // per-file outcome, so the poller keeps moving even if this one file
    // failed (the overall job only flips to failed below).
    await updateItem(
      DRIVE_JOBS_TABLE,
      { jobId },
      'SET #processed = :p, #total = :t, currentFileName = :n',
      { ':p': body.processed ?? 0, ':t': body.total ?? 0, ':n': body.currentFileName ?? '' },
      undefined,
      { '#processed': 'processed', '#total': 'total' }
    )

    if (status === 'failed') {
      await updateTransferFileStatus(batchId, fileId, 'failed')
      await updateItem(
        DRIVE_JOBS_TABLE,
        { jobId },
        'SET #s = :failed, errorMessage = :err',
        { ':failed': 'failed', ':err': body.errorMessage ?? 'Import failed' },
        undefined,
        { '#s': 'status' }
      )
      void logAudit({
        eventType: 'DRIVE_IMPORT_FAILED',
        actor: 'system', outcome: 'failure',
        walletId, fileId: batchId,
        errorMessage: body.errorMessage,
        metadata: { jobId, failedFileId: fileId },
      })
      return NextResponse.json<ApiResponse<{ ok: true }>>({ success: true, data: { ok: true } })
    }

    const { batchComplete } = await finalizeBatchIfComplete({ batchId, fileId, walletId })
    if (batchComplete) {
      await updateItem(DRIVE_JOBS_TABLE, { jobId }, 'SET #s = :ready', { ':ready': 'ready' }, undefined, { '#s': 'status' })
    }

    return NextResponse.json<ApiResponse<{ ok: true }>>({ success: true, data: { ok: true } })
  } catch (err) {
    console.error('[google-drive/import/file-complete]', err)
    await updateItem(
      DRIVE_JOBS_TABLE,
      { jobId },
      'SET #s = :failed, errorMessage = :err',
      { ':failed': 'failed', ':err': 'Internal error while finishing this import' },
      undefined,
      { '#s': 'status' }
    ).catch(() => {})
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to record file completion' },
      { status: 500 }
    )
  }
}
