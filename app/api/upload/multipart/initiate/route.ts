import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { calculatePrice } from '@/lib/pricing'
import { deductFromWallet, getWalletBalance, getFreeQuotaUsedBytes, consumeFreeQuota } from '@/lib/wallet'
import { getItem, putItem, queryItems } from '@/lib/aws/dynamodb'
import { initiateUpload, getObjectKey, NEW_UPLOAD_BACKEND } from '@/lib/aws/storage'
import { logAudit } from '@/lib/audit'
import {
  MAX_FILE_SIZE_GB,
  MULTIPART_CHUNK_SIZE_BYTES,
  RATE_LIMIT_UPLOADS_PER_HOUR,
  EXPIRY_DAY_OPTIONS,
  DEFAULT_EXPIRY_DAYS,
} from '@/constants/pricing'
import type { ApiResponse, Transfer, Wallet, AuditEvent } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      walletId?: string
      fileName?: string
      fileSizeBytes?: number
      recipientEmails?: string[]
      contentType?: string
      expiryDays?: number
    }

    const { walletId, fileName, fileSizeBytes, recipientEmails, contentType } = body
    const expiryDays = EXPIRY_DAY_OPTIONS.includes(body.expiryDays as typeof EXPIRY_DAY_OPTIONS[number])
      ? body.expiryDays!
      : DEFAULT_EXPIRY_DAYS

    if (!walletId || !fileName || !fileSizeBytes) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'MISSING_PARAMS', message: 'walletId, fileName, fileSizeBytes are required' },
        { status: 400 }
      )
    }

    // Validate file size
    const maxBytes = MAX_FILE_SIZE_GB * 1024 * 1024 * 1024
    if (fileSizeBytes > maxBytes) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'FILE_TOO_LARGE', message: `File exceeds ${MAX_FILE_SIZE_GB}GB limit` },
        { status: 400 }
      )
    }

    // Validate wallet belongs to session
    const walletsTable = process.env.DYNAMO_WALLETS_TABLE ?? 'vayu-wallets'
    const wallet = await getItem<Wallet>(walletsTable, { walletId })
    if (!wallet) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'WALLET_NOT_FOUND', message: 'Wallet not found' },
        { status: 404 }
      )
    }

    // Rate limit: max 10 uploads/hour per walletId
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const auditTable = process.env.DYNAMO_AUDIT_TABLE ?? 'vayu-audit'
    const recentUploads = await queryItems<AuditEvent>(
      auditTable,
      'walletId-index',
      'walletId = :w AND createdAt >= :t',
      { ':w': walletId, ':t': oneHourAgo, ':e': 'UPLOAD_INITIATED' },
      'eventType = :e'
    )

    if (recentUploads.length >= RATE_LIMIT_UPLOADS_PER_HOUR) {
      void logAudit({
        eventType: 'RATE_LIMIT_HIT',
        actor: 'user',
        outcome: 'warning',
        walletId,
        metadata: { uploadsInLastHour: recentUploads.length, limit: RATE_LIMIT_UPLOADS_PER_HOUR },
      })
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'RATE_LIMIT_EXCEEDED', message: `Maximum ${RATE_LIMIT_UPLOADS_PER_HOUR} uploads per hour allowed` },
        { status: 429 }
      )
    }

    // Calculate price (free-quota-aware) and check balance
    const freeUsedBytes = await getFreeQuotaUsedBytes(walletId)
    const pricing = calculatePrice(fileSizeBytes, freeUsedBytes)
    const balance = await getWalletBalance(walletId)

    if (!pricing.isFree && balance < pricing.totalPaise) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: 'INSUFFICIENT_BALANCE',
          message: `Insufficient balance. Need ${pricing.totalFormatted}, have ₹${(balance / 100).toFixed(2)}`,
        },
        { status: 402 }
      )
    }

    // Generate IDs
    const fileId = uuidv4()
    const objectKey = getObjectKey(fileId, fileName)

    // Deduct wallet (or consume free quota) BEFORE generating upload URL
    // (zero loss guarantee)
    if (pricing.isFree) {
      await consumeFreeQuota(walletId, fileSizeBytes)
    } else {
      await deductFromWallet(walletId, pricing.totalPaise, fileId)
    }

    // Initiate multipart upload — new uploads always go to NEW_UPLOAD_BACKEND
    const uploadId = await initiateUpload(NEW_UPLOAD_BACKEND, objectKey, contentType ?? 'application/octet-stream')

    // Save transfer record — expiryTime is always createdAt + expiryDays,
    // anchored to this initiate timestamp (not completedAt), which is also
    // the more conservative bound relative to the R2 bucket's own 20-day-
    // from-object-creation delete rule (initiate always happens slightly
    // before the object actually finishes uploading).
    const now = new Date().toISOString()
    const transfer: Transfer = {
      fileId,
      walletId,
      fileName,
      fileSizeBytes,
      billableGB: pricing.billableGB,
      downloadsUsed: 0,
      recipientEmails,
      amountDeducted: pricing.totalPaise,
      isFreeTransfer: pricing.isFree,
      status: 'pending',
      storageBackend: NEW_UPLOAD_BACKEND,
      ...(NEW_UPLOAD_BACKEND === 'R2' ? { r2Key: objectKey } : { s3Key: objectKey }),
      expiryDays,
      expiryTime: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now,
    }

    const transfersTable = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
    await putItem(transfersTable, transfer)

    void logAudit({
      eventType: 'UPLOAD_INITIATED',
      actor: 'user',
      outcome: 'success',
      walletId,
      fileId,
      amountPaise: pricing.totalPaise,
      metadata: {
        fileName,
        fileSizeBytes,
        billableGB: pricing.billableGB,
        isFreeTransfer: pricing.isFree,
        totalDeductedPaise: pricing.totalPaise,
        balanceBeforePaise: balance,
        balanceAfterPaise: balance - pricing.totalPaise,
      },
    })

    const totalChunks = Math.ceil(fileSizeBytes / MULTIPART_CHUNK_SIZE_BYTES)

    return NextResponse.json<ApiResponse<{
      fileId: string
      uploadId: string
      s3Key: string
      totalChunks: number
      chunkSizeBytes: number
      priceBreakdown: typeof pricing
    }>>({
      success: true,
      data: {
        fileId,
        uploadId,
        s3Key: objectKey, // wire-protocol field name kept as-is (client just treats it as an opaque key); the actual backend is looked up server-side from the transfer record on every subsequent call
        totalChunks,
        chunkSizeBytes: MULTIPART_CHUNK_SIZE_BYTES,
        priceBreakdown: pricing,
      },
    })
  } catch (err) {
    console.error('[upload/initiate]', err)
    if (err instanceof Error && err.message === 'INSUFFICIENT_BALANCE') {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'INSUFFICIENT_BALANCE', message: 'Insufficient wallet balance' },
        { status: 402 }
      )
    }
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Upload initiation failed' },
      { status: 500 }
    )
  }
}
