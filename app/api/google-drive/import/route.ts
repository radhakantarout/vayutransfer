import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { v4 as uuidv4 } from 'uuid'
import { authOptions } from '@/lib/auth'
import { getUserById } from '@/lib/users'
import { getDriveAccessToken } from '@/lib/googleDrive/oauth'
import { resolveDriveSelection } from '@/lib/googleDrive/resolveSelection'
import { createDriveImportBatch } from '@/lib/transferBatch'
import { queryItems, putItem } from '@/lib/aws/dynamodb'
import { logAudit } from '@/lib/audit'
import {
  MAX_FILE_SIZE_GB,
  RATE_LIMIT_UPLOADS_PER_HOUR,
  EXPIRY_DAY_OPTIONS,
  DEFAULT_EXPIRY_DAYS,
} from '@/constants/pricing'
import type { ApiResponse, AuditEvent, DriveJob } from '@/types'

// Fully separate Lambda client/table/route from both VayuTransfer's own
// zip-download Lambda and VayuStudios' Lambdas — same architecture
// pattern (job row + async invoke + poll), zero shared runtime code.
const lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })
const DRIVE_JOBS_TABLE = process.env.DYNAMO_DRIVE_JOBS_TABLE ?? 'vayu-drive-jobs'

// Mirrors app/api/upload/batch/initiate/route.ts's shape closely (rate
// limit, expiry validation, wallet deduction via the shared
// deductForNewBatch preamble, audit logging) — the one real difference is
// where the file list comes from: re-resolved fresh from Google Drive here
// rather than accepted from the client, since this is the point money is
// actually spent and Drive metadata (real size) is the only thing allowed
// to influence that.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'UNAUTHORIZED', message: 'Sign in first' },
        { status: 401 }
      )
    }
    const userId = session.user.id

    const user = await getUserById(userId)
    if (!user) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'WALLET_NOT_FOUND', message: 'Wallet not found' },
        { status: 404 }
      )
    }
    const walletId = user.walletId

    const body = await req.json() as {
      items?: { id: string; mimeType: string }[]
      recipientEmails?: string[]
      message?: string
      senderNotifyEmail?: string
      expiryDays?: number
    }
    const items = body.items ?? []
    if (items.length === 0) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'MISSING_PARAMS', message: 'No items selected' },
        { status: 400 }
      )
    }
    const expiryDays = EXPIRY_DAY_OPTIONS.includes(body.expiryDays as typeof EXPIRY_DAY_OPTIONS[number])
      ? body.expiryDays!
      : DEFAULT_EXPIRY_DAYS

    if (!process.env.DRIVE_IMPORT_LAMBDA_ARN) {
      console.error('[google-drive/import] DRIVE_IMPORT_LAMBDA_ARN not set')
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'NOT_CONFIGURED', message: 'Google Drive import is not available right now' },
        { status: 503 }
      )
    }

    // Rate limit: same ceiling as normal uploads, counted against this
    // feature's own audit event so a burst of Drive imports and a burst of
    // local uploads don't share one counter.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const auditTable = process.env.DYNAMO_AUDIT_TABLE ?? 'vayu-audit'
    const recentImports = await queryItems<AuditEvent>(
      auditTable,
      'walletId-index',
      'walletId = :w AND createdAt >= :t',
      { ':w': walletId, ':t': oneHourAgo, ':e': 'DRIVE_IMPORT_STARTED' },
      'eventType = :e'
    )
    if (recentImports.length >= RATE_LIMIT_UPLOADS_PER_HOUR) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'RATE_LIMIT_EXCEEDED', message: `Maximum ${RATE_LIMIT_UPLOADS_PER_HOUR} imports per hour allowed` },
        { status: 429 }
      )
    }

    const { files: resolvedFiles, totalSizeBytes, unsupported } = await resolveDriveSelection(userId, items)

    if (resolvedFiles.length === 0) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: 'NO_SUPPORTED_FILES',
          message: unsupported.length > 0
            ? `These file types can't be imported: ${unsupported.slice(0, 3).join(', ')}${unsupported.length > 3 ? '…' : ''}`
            : 'No accessible files found in your selection',
        },
        { status: 400 }
      )
    }

    const maxBytes = MAX_FILE_SIZE_GB * 1024 * 1024 * 1024
    if (totalSizeBytes > maxBytes) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'FILE_TOO_LARGE', message: `Total selection exceeds ${MAX_FILE_SIZE_GB}GB limit` },
        { status: 400 }
      )
    }

    const { batchId, files: fileResults, pricing } = await createDriveImportBatch({
      walletId,
      files: resolvedFiles.map((f) => ({
        driveFileId: f.driveFileId,
        fileName: f.name,
        fileSizeBytes: f.sizeBytes,
        relativePath: f.relativePath,
        contentType: f.isWorkspaceExport ? f.exportMimeType! : f.mimeType,
        exportMimeType: f.exportMimeType,
      })),
      recipientEmails: body.recipientEmails,
      message: body.message,
      senderNotifyEmail: body.senderNotifyEmail,
      expiryDays,
    })

    // Short-lived access token minted fresh right before invoke — the
    // Lambda never sees the refresh token, only this. Drive access tokens
    // last ~1hr, comfortably inside the Lambda's own 900s execution ceiling.
    const accessToken = await getDriveAccessToken(userId)
    if (!accessToken) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'DRIVE_NOT_CONNECTED', message: 'Reconnect your Google Drive account and try again' },
        { status: 403 }
      )
    }

    const jobId = uuidv4()
    const now = new Date().toISOString()
    const ttl = Math.floor(Date.now() / 1000) + 24 * 60 * 60

    const job: DriveJob = {
      jobId, batchId, status: 'pending',
      processed: 0, total: fileResults.length,
      createdAt: now, ttl,
    }
    await putItem(DRIVE_JOBS_TABLE, job)

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

    lambda.send(new InvokeCommand({
      FunctionName: process.env.DRIVE_IMPORT_LAMBDA_ARN,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify({
        jobId, batchId, walletId,
        files: fileResults,
        driveAccessToken: accessToken,
        callbackUrl: `${appUrl}/api/google-drive/import/file-complete`,
        internalSecret: process.env.GOOGLE_DRIVE_INTERNAL_SECRET,
        r2Bucket: process.env.R2_TRANSFER_BUCKET,
        r2Endpoint: process.env.R2_TRANSFER_ENDPOINT,
        r2AccessKeyId: process.env.R2_TRANSFER_ACCESS_KEY_ID,
        r2SecretAccessKey: process.env.R2_TRANSFER_SECRET_ACCESS_KEY,
      })),
    })).catch((err: unknown) => console.error('[drive import invoke]', err))

    void logAudit({
      eventType: 'DRIVE_IMPORT_STARTED',
      actor: 'user', outcome: 'success',
      walletId, fileId: batchId,
      amountPaise: pricing.totalPaise,
      metadata: { jobId, fileCount: fileResults.length, totalSizeBytes, unsupportedCount: unsupported.length },
    })

    return NextResponse.json<ApiResponse<{ batchId: string; jobId: string }>>({
      success: true,
      data: { batchId, jobId },
    })
  } catch (err) {
    console.error('[google-drive/import]', err)
    if (err instanceof Error && err.message === 'DRIVE_NOT_CONNECTED') {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'DRIVE_NOT_CONNECTED', message: 'Reconnect your Google Drive account and try again' },
        { status: 403 }
      )
    }
    if (err instanceof Error && (err.message === 'INSUFFICIENT_BALANCE' || err.message === 'WALLET_NOT_FOUND')) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: err.message, message: err.message === 'WALLET_NOT_FOUND' ? 'Wallet not found' : 'Insufficient wallet balance' },
        { status: err.message === 'WALLET_NOT_FOUND' ? 404 : 402 }
      )
    }
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Could not start the Google Drive import' },
      { status: 500 }
    )
  }
}
