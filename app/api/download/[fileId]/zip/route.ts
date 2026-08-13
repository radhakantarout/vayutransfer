import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { getItem, putItem, updateItem } from '@/lib/aws/dynamodb'
import { getTransferFiles, transferFileKey } from '@/lib/transferBatch'
import { logAudit } from '@/lib/audit'
import { MAX_DOWNLOADS_PER_LINK } from '@/constants/pricing'
import type { ApiResponse, Transfer, ZipJob } from '@/types'

// Fully separate Lambda client/table/route from VayuStudios' own zip
// pipeline (app/studio/api/print/gallery/[token]/download-all) — same
// architecture pattern, zero shared runtime code, per the standing rule.
const lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
const ZIP_JOBS_TABLE = process.env.DYNAMO_ZIP_JOBS_TABLE ?? 'vayu-zip-jobs'

// Starts (or resolves an already-started) server-side zip build for a large
// batch's "Download All" — the client only calls this for batches >=1GB
// total; smaller ones zip entirely in-browser and never hit this route.
// One zip is built per batch and cached on the Transfer (zipJobId) so
// repeat "Download All" clicks — same visitor or a second recipient —
// reuse the same finished archive instead of rebuilding it every time.
export async function POST(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const { fileId } = params
  const transfer = await getItem<Transfer>(TRANSFERS_TABLE, { fileId })

  if (!transfer) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'FILE_NOT_FOUND', message: 'File not found' },
      { status: 404 }
    )
  }
  if (!transfer.fileCount) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'NOT_A_BATCH', message: 'This link is not a multi-file batch' },
      { status: 400 }
    )
  }
  if (new Date() > new Date(transfer.expiryTime)) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'LINK_EXPIRED', message: 'This download link has expired' },
      { status: 410 }
    )
  }
  if (transfer.status !== 'active') {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'FILE_NOT_READY', message: 'File is not available for download' },
      { status: 404 }
    )
  }

  // Cache reuse: an existing non-failed job means either it's already
  // ready or already being built — either way, don't spend another
  // download visit or invoke the Lambda again.
  if (transfer.zipJobId) {
    const existing = await getItem<ZipJob>(ZIP_JOBS_TABLE, { jobId: transfer.zipJobId })
    if (existing && existing.status !== 'failed') {
      return NextResponse.json<ApiResponse<{ jobId: string }>>({ success: true, data: { jobId: existing.jobId } })
    }
  }

  if (transfer.downloadsUsed >= MAX_DOWNLOADS_PER_LINK) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'DOWNLOAD_LIMIT_REACHED', message: 'This link has reached its download limit' },
      { status: 410 }
    )
  }

  if (!process.env.TRANSFER_ZIP_LAMBDA_ARN) {
    console.error('[download zip init] TRANSFER_ZIP_LAMBDA_ARN not set')
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'NOT_CONFIGURED', message: 'Zip downloads are not available right now' },
      { status: 503 }
    )
  }

  // Same atomic increment + abuse-ceiling guard as the plain download POST
  // route — starting a new zip build spends the batch's one download visit,
  // same as fetching every file's individual presigned URL would.
  try {
    await updateItem(
      TRANSFERS_TABLE,
      { fileId },
      'SET downloadsUsed = downloadsUsed + :one',
      { ':one': 1, ':current': transfer.downloadsUsed, ':max': MAX_DOWNLOADS_PER_LINK },
      'downloadsUsed = :current AND downloadsUsed < :max'
    )
  } catch {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'DOWNLOAD_LIMIT_REACHED', message: 'This link has reached its download limit' },
      { status: 410 }
    )
  }

  const files = (await getTransferFiles(transfer))
    .filter((f) => f.status !== 'failed')
    .map((f) => ({ fileId: f.fileId, name: f.relativePath || f.fileName, r2Key: transferFileKey(f) }))

  if (files.length === 0) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'NO_FILES', message: 'No files available to zip' },
      { status: 404 }
    )
  }

  const jobId = uuidv4()
  const now = new Date().toISOString()
  const ttl = Math.floor(Date.now() / 1000) + 24 * 60 * 60 // 1 day — zip jobs are short-lived

  const job: ZipJob = {
    jobId, batchId: fileId, status: 'pending',
    processed: 0, total: files.length,
    createdAt: now, ttl,
  }
  await putItem(ZIP_JOBS_TABLE, job)
  await updateItem(TRANSFERS_TABLE, { fileId }, 'SET zipJobId = :j', { ':j': jobId })

  const zipFileName = `${(transfer.fileName || 'files').replace(/[^a-z0-9]+/gi, '-')}.zip`

  lambda.send(new InvokeCommand({
    FunctionName: process.env.TRANSFER_ZIP_LAMBDA_ARN,
    InvocationType: 'Event',
    Payload: Buffer.from(JSON.stringify({
      jobId, batchId: fileId, files, zipFileName,
      r2Bucket: process.env.R2_TRANSFER_BUCKET,
      r2Endpoint: process.env.R2_TRANSFER_ENDPOINT,
      r2AccessKeyId: process.env.R2_TRANSFER_ACCESS_KEY_ID,
      r2SecretAccessKey: process.env.R2_TRANSFER_SECRET_ACCESS_KEY,
    })),
  })).catch((err: unknown) => console.error('[transfer zip invoke]', err))

  void logAudit({
    eventType: 'ZIP_DOWNLOAD_STARTED',
    actor: 'user', outcome: 'success',
    walletId: transfer.walletId, fileId,
    metadata: { jobId, fileCount: files.length },
  })

  return NextResponse.json<ApiResponse<{ jobId: string }>>({ success: true, data: { jobId } })
}
