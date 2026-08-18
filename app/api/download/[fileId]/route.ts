import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { getItem, updateItem, putItem } from '@/lib/aws/dynamodb'
import { getDownloadPresignedUrl, getKeyDownloadPresignedUrl } from '@/lib/aws/storage'
import { getTransferFiles, transferFileKey } from '@/lib/transferBatch'
import { sendDownloadNotificationEmail } from '@/lib/aws/ses'
import { logAudit } from '@/lib/audit'
import { MAX_DOWNLOADS_PER_LINK } from '@/constants/pricing'
import type { ApiResponse, Transfer, Download } from '@/types'

// ─── GET — file info only, no counter increment ───────────────────────────
// Called on page load to display file name, size, expiry. Downloads are
// unlimited from the user's point of view until the link expires — no
// "slots" concept is ever surfaced here.
export async function GET(
  _req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const { fileId } = params
  const transfersTable = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
  const transfer = await getItem<Transfer>(transfersTable, { fileId })

  if (!transfer) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'FILE_NOT_FOUND', message: 'File not found' },
      { status: 404 }
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

  // No file details at all until the password is verified — the recipient
  // only learns anything about this transfer via POST /verify-password.
  if (transfer.passwordEnabled) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'PASSWORD_REQUIRED', message: 'This transfer is password protected' },
      { status: 401 }
    )
  }

  // Batch transfers additionally list their files (name/size/path only —
  // no keys, no URLs) so the download page can render the list up front.
  const files = transfer.fileCount
    ? (await getTransferFiles(transfer))
        .filter((f) => f.status !== 'failed')
        .map((f) => ({ fileId: f.fileId, fileName: f.fileName, relativePath: f.relativePath, fileSizeBytes: f.fileSizeBytes }))
    : undefined

  return NextResponse.json<ApiResponse<{
    fileName: string
    fileSizeBytes: number
    expiryTime: string
    fileCount?: number
    files?: { fileId: string; fileName: string; relativePath?: string; fileSizeBytes: number }[]
  }>>({
    success: true,
    data: {
      fileName: transfer.fileName,
      fileSizeBytes: transfer.fileSizeBytes,
      expiryTime: transfer.expiryTime,
      fileCount: transfer.fileCount,
      files,
    },
  })
}

// ─── POST — actual download: increments counter, returns presigned URL ─────
// Called only when the user clicks "Download File". downloadsUsed keeps
// counting purely for the activity feed; MAX_DOWNLOADS_PER_LINK is a
// silent abuse ceiling, never shown to the user as a configurable limit.
export async function POST(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const { fileId } = params
  const downloadId = uuidv4()
  const attemptedAt = new Date().toISOString()

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex')
  const userAgent = req.headers.get('user-agent') ?? undefined
  const countryCode = req.headers.get('cloudfront-viewer-country') ?? undefined

  const transfersTable = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
  const downloadsTable = process.env.DYNAMO_DOWNLOADS_TABLE ?? 'vayu-downloads'

  const transfer = await getItem<Transfer>(transfersTable, { fileId })

  if (!transfer) {
    void logAudit({ eventType: 'DOWNLOAD_BLOCKED_INVALID', actor: 'user', outcome: 'failure', fileId, errorCode: 'FILE_NOT_FOUND' })
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'FILE_NOT_FOUND', message: 'File not found' },
      { status: 404 }
    )
  }

  const baseRecord: Omit<Download, 'outcome'> = {
    downloadId, fileId, walletId: transfer.walletId, attemptedAt,
    downloadsUsedAtTime: transfer.downloadsUsed,
    userAgent, ipHash, countryCode,
  }

  if (new Date() > new Date(transfer.expiryTime)) {
    await putItem(downloadsTable, { ...baseRecord, outcome: 'expired' })
    void logAudit({ eventType: 'DOWNLOAD_BLOCKED_EXPIRED', actor: 'user', outcome: 'failure', walletId: transfer.walletId, fileId, downloadId, metadata: { expiryTime: transfer.expiryTime } })
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'LINK_EXPIRED', message: 'This download link has expired' },
      { status: 410 }
    )
  }

  if (transfer.downloadsUsed >= MAX_DOWNLOADS_PER_LINK) {
    await putItem(downloadsTable, { ...baseRecord, outcome: 'exhausted' })
    void logAudit({ eventType: 'DOWNLOAD_BLOCKED_EXHAUSTED', actor: 'user', outcome: 'failure', walletId: transfer.walletId, fileId, downloadId, metadata: { downloadsUsed: transfer.downloadsUsed } })
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'DOWNLOAD_LIMIT_REACHED', message: 'This link has reached its download limit' },
      { status: 410 }
    )
  }

  if (transfer.status !== 'active') {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'FILE_NOT_READY', message: 'File is not available for download' },
      { status: 404 }
    )
  }

  // Re-validated here too, not just at /verify-password — this is the
  // route that actually mints presigned URLs, so it's the one that must
  // never trust a client-side "already verified" flag.
  if (transfer.passwordEnabled) {
    const { password } = await req.json().catch(() => ({ password: undefined })) as { password?: string }
    const valid = password ? await bcrypt.compare(password, transfer.passwordHash ?? '') : false
    if (!valid) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'PASSWORD_REQUIRED', message: 'Incorrect password' },
        { status: 401 }
      )
    }
  }

  // Atomic increment with optimistic lock, still guarded by the silent
  // abuse ceiling so a burst of concurrent requests can't blow past it.
  const newDownloadsUsed = transfer.downloadsUsed + 1
  try {
    await updateItem(
      transfersTable,
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

  // Batch transfers spend exactly one visit for the whole selection — every
  // file's presigned URL is generated and returned together from this one
  // POST. The client then triggers each file's raw browser download
  // itself; nothing is zipped server- or client-side.
  const batchFiles = transfer.fileCount
    ? await Promise.all(
        (await getTransferFiles(transfer))
          .filter((f) => f.status !== 'failed')
          .map(async (f) => ({
            fileId: f.fileId,
            fileName: f.fileName,
            relativePath: f.relativePath,
            fileSizeBytes: f.fileSizeBytes,
            downloadUrl: await getKeyDownloadPresignedUrl(f.storageBackend, transferFileKey(f), f.fileName),
          }))
      )
    : undefined

  const downloadUrl = batchFiles ? undefined : await getDownloadPresignedUrl(transfer)

  await putItem(downloadsTable, { ...baseRecord, outcome: 'success', downloadsUsedAtTime: newDownloadsUsed })

  if (transfer.senderNotifyEmail) {
    void sendDownloadNotificationEmail(transfer.senderNotifyEmail, transfer.fileName, attemptedAt)
      .catch((err) => console.error('[ses] download notification failed to', transfer.senderNotifyEmail, err))
  }

  const minutesToExpiry = Math.max(0, Math.round((new Date(transfer.expiryTime).getTime() - Date.now()) / 60000))

  void logAudit({
    eventType: 'DOWNLOAD_SUCCESS',
    actor: 'user', outcome: 'success',
    walletId: transfer.walletId, fileId, downloadId,
    metadata: {
      fileName: transfer.fileName,
      fileSizeBytes: transfer.fileSizeBytes,
      fileCount: transfer.fileCount,
      downloadsUsed: newDownloadsUsed,
      minutesToExpiry,
    },
  })

  return NextResponse.json<ApiResponse<{
    downloadUrl?: string
    files?: { fileId: string; fileName: string; relativePath?: string; fileSizeBytes: number; downloadUrl: string }[]
    fileName: string
    fileSizeBytes: number
    expiryTime: string
  }>>({
    success: true,
    data: {
      downloadUrl,
      files: batchFiles,
      fileName: transfer.fileName,
      fileSizeBytes: transfer.fileSizeBytes,
      expiryTime: transfer.expiryTime,
    },
  })
}
