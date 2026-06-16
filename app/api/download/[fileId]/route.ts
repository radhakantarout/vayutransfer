import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { getItem, updateItem, putItem } from '@/lib/aws/dynamodb'
import { generateDownloadPresignedUrl } from '@/lib/aws/s3'
import { logAudit } from '@/lib/audit'
import type { ApiResponse, Transfer, Download } from '@/types'

// ─── GET — file info only, no counter increment ───────────────────────────
// Called on page load to display file name, size, slots remaining, expiry.
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

  if (transfer.status === 'exhausted' || transfer.downloadsUsed >= transfer.downloadSlots) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'DOWNLOAD_LIMIT_REACHED', message: 'All download slots have been used' },
      { status: 410 }
    )
  }

  if (transfer.status !== 'active') {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'FILE_NOT_READY', message: 'File is not available for download' },
      { status: 404 }
    )
  }

  return NextResponse.json<ApiResponse<{
    fileName: string
    fileSizeBytes: number
    downloadsUsed: number
    downloadSlots: number
    downloadsRemaining: number
    expiryTime: string
  }>>({
    success: true,
    data: {
      fileName: transfer.fileName,
      fileSizeBytes: transfer.fileSizeBytes,
      downloadsUsed: transfer.downloadsUsed,
      downloadSlots: transfer.downloadSlots,
      downloadsRemaining: transfer.downloadSlots - transfer.downloadsUsed,
      expiryTime: transfer.expiryTime,
    },
  })
}

// ─── POST — actual download: increments counter, returns presigned URL ─────
// Called only when the user clicks "Download File".
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
    downloadsAllowedAtTime: transfer.downloadSlots,
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

  if (transfer.status === 'exhausted' || transfer.downloadsUsed >= transfer.downloadSlots) {
    await putItem(downloadsTable, { ...baseRecord, outcome: 'exhausted' })
    void logAudit({ eventType: 'DOWNLOAD_BLOCKED_EXHAUSTED', actor: 'user', outcome: 'failure', walletId: transfer.walletId, fileId, downloadId, metadata: { downloadsUsed: transfer.downloadsUsed, downloadSlots: transfer.downloadSlots } })
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'DOWNLOAD_LIMIT_REACHED', message: 'All download slots have been used' },
      { status: 410 }
    )
  }

  if (transfer.status !== 'active') {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'FILE_NOT_READY', message: 'File is not available for download' },
      { status: 404 }
    )
  }

  // Atomic increment with optimistic lock
  const newDownloadsUsed = transfer.downloadsUsed + 1
  try {
    await updateItem(
      transfersTable,
      { fileId },
      'SET downloadsUsed = downloadsUsed + :one',
      { ':one': 1, ':current': transfer.downloadsUsed },
      'downloadsUsed = :current'
    )
  } catch {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'DOWNLOAD_LIMIT_REACHED', message: 'All download slots have been used' },
      { status: 410 }
    )
  }

  // Mark exhausted when last slot is consumed
  if (newDownloadsUsed >= transfer.downloadSlots) {
    await updateItem(transfersTable, { fileId }, 'SET #status = :exhausted', { ':exhausted': 'exhausted' }, undefined, { '#status': 'status' })
    void logAudit({ eventType: 'LINK_EXHAUSTED', actor: 'system', outcome: 'success', walletId: transfer.walletId, fileId, metadata: { downloadSlots: transfer.downloadSlots } })
  }

  const downloadUrl = await generateDownloadPresignedUrl(transfer.s3Key, transfer.fileName)

  await putItem(downloadsTable, { ...baseRecord, outcome: 'success', downloadsUsedAtTime: newDownloadsUsed })

  const minutesToExpiry = Math.max(0, Math.round((new Date(transfer.expiryTime).getTime() - Date.now()) / 60000))

  void logAudit({
    eventType: 'DOWNLOAD_SUCCESS',
    actor: 'user', outcome: 'success',
    walletId: transfer.walletId, fileId, downloadId,
    metadata: {
      fileName: transfer.fileName,
      fileSizeBytes: transfer.fileSizeBytes,
      downloadsUsed: newDownloadsUsed,
      downloadsAllowed: transfer.downloadSlots,
      downloadsRemaining: transfer.downloadSlots - newDownloadsUsed,
      minutesToExpiry,
    },
  })

  return NextResponse.json<ApiResponse<{
    downloadUrl: string
    fileName: string
    fileSizeBytes: number
    downloadsRemaining: number
    expiryTime: string
  }>>({
    success: true,
    data: {
      downloadUrl,
      fileName: transfer.fileName,
      fileSizeBytes: transfer.fileSizeBytes,
      downloadsRemaining: transfer.downloadSlots - newDownloadsUsed,
      expiryTime: transfer.expiryTime,
    },
  })
}
