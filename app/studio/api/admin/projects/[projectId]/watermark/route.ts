import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByPK, studioQueryByIndex, studioPutItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { invokeStudioWatermarkLambda } from '@/lib/studio/watermark'
import { runWithConcurrencyLimit } from '@/lib/studio/clientUpload'
import type { MediaFile, StudioJob } from '@/types/studio'

// Caps how many per-file Lambda invokes are in flight at once — mirrors the
// same class of fix as the client-side bulk-upload concurrency cap. Without
// this, selecting a few thousand photos fires that many simultaneous
// InvokeCommands off the back of one request.
const WATERMARK_INVOKE_CONCURRENCY = 20

// Bulk apply/remove watermark — body { fileIds?: string[], watermarkEnabled: boolean }.
// Omitting fileIds targets every eligible file in the project (mirrors
// backfill-previews' "whole project" query shape). Only touches files whose
// bytes actually exist (READY or FAILED — never UPLOADING/PROCESSING, which
// would race the in-flight upload or an already-running watermark job).
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    if (!process.env.WATERMARK_LAMBDA_ARN) {
      return NextResponse.json({ success: false, error: 'LAMBDA_NOT_CONFIGURED' }, { status: 503 })
    }

    const { projectId } = params
    const studioId = auth.studioId!
    const body = await req.json().catch(() => ({}))
    const { fileIds, watermarkEnabled } = body as { fileIds?: string[]; watermarkEnabled?: boolean }
    if (typeof watermarkEnabled !== 'boolean') {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    const allFiles = await studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', projectId)
    const eligible = allFiles.filter((f) =>
      f.studioId === studioId
      && (f.processingStatus === 'READY' || f.processingStatus === 'FAILED')
      && (!fileIds || fileIds.includes(f.fileId))
    )

    if (eligible.length === 0) {
      return NextResponse.json({ success: true, data: { queued: 0, total: 0 } })
    }

    // Same run-lock shape as face-indexing's — without it, two overlapping
    // bulk-watermark calls on the same project would race each other's
    // progress counters. The projectId-status-index GSI has no jobType in
    // its key (see faces/route.ts's own comment on this same limitation),
    // so a PROCESSING job of a *different* type (e.g. a print-portal
    // ZIP_DOWNLOAD, or an INDEX_FACES run) would otherwise be picked up as
    // "watermarking already running" and silently block every future
    // watermark request on this project — fetch a small batch and filter
    // to WATERMARK in code instead of trusting Limit:1 alone.
    const runningJobs = await studioQueryByIndex<StudioJob>(
      TABLES.jobs, 'projectId-status-index',
      'projectId = :pid AND #s = :processing',
      { ':pid': projectId, ':processing': 'PROCESSING' },
      { '#s': 'status' }, 25
    )
    const runningWatermarkJob = runningJobs.find(j => j.jobType === 'WATERMARK')
    if (runningWatermarkJob) {
      return NextResponse.json({
        success: false, error: 'JOB_RUNNING',
        message: 'Watermarking is already in progress',
        data: { jobId: runningWatermarkJob.jobId },
      }, { status: 409 })
    }

    const jobId = crypto.randomUUID()
    const now = new Date().toISOString()
    const ttl = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60

    const job: StudioJob = {
      jobId, jobType: 'WATERMARK', status: 'PROCESSING',
      projectId, studioId,
      inputPayload: { triggeredBy: auth.userId, watermarkEnabled },
      outputPayload: { processed: 0, total: eligible.length },
      createdAt: now, ttl,
    }
    await studioPutItem(TABLES.jobs, job as unknown as Record<string, unknown>)

    let queued = 0
    await runWithConcurrencyLimit(eligible, WATERMARK_INVOKE_CONCURRENCY, async (f) => {
      try {
        await studioUpdateItem(
          TABLES.mediafiles,
          { projectId, fileId: f.fileId },
          'SET watermarkEnabled = :wm, updatedAt = :now',
          { ':wm': watermarkEnabled, ':now': now }
        )
        await invokeStudioWatermarkLambda({
          fileId: f.fileId,
          projectId,
          studioId,
          sourceKey: f.r2Key ?? f.s3Key!,
          sourceBackend: f.r2Key ? 'R2' : 'S3',
          watermarkEnabled,
          fileType: f.fileType,
          previewKeySuffix: `wm-${Date.now()}`,
          jobId,
        })
        queued++
      } catch (err) {
        console.error(`[watermark bulk] failed for ${f.fileId}:`, err)
      }
    })

    return NextResponse.json({ success: true, data: { jobId, queued, total: eligible.length } })
  } catch (err) {
    console.error('[watermark POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
