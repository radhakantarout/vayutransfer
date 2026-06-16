import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { calculatePrice } from '@/lib/pricing'
import { deductFromWallet, getWalletBalance } from '@/lib/wallet'
import { getItem, putItem, queryItems } from '@/lib/aws/dynamodb'
import { initiateMultipartUpload, getS3Key } from '@/lib/aws/s3'
import { logAudit } from '@/lib/audit'
import {
  MAX_FILE_SIZE_GB,
  MULTIPART_CHUNK_SIZE_BYTES,
  RATE_LIMIT_UPLOADS_PER_HOUR,
} from '@/constants/pricing'
import type { ApiResponse, Transfer, Wallet, AuditEvent } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      walletId?: string
      fileName?: string
      fileSizeBytes?: number
      downloadSlots?: number
      recipientEmail?: string
      contentType?: string
    }

    const { walletId, fileName, fileSizeBytes, downloadSlots, recipientEmail, contentType } = body

    if (!walletId || !fileName || !fileSizeBytes || !downloadSlots) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'MISSING_PARAMS', message: 'walletId, fileName, fileSizeBytes, downloadSlots are required' },
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

    // Calculate price and check balance
    const pricing = calculatePrice(fileSizeBytes, downloadSlots)
    const balance = await getWalletBalance(walletId)

    if (balance < pricing.totalPaise) {
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
    const s3Key = getS3Key(fileId, fileName)

    // Deduct wallet BEFORE generating upload URL (zero loss guarantee)
    await deductFromWallet(walletId, pricing.totalPaise, fileId)

    // Initiate multipart upload on S3
    const uploadId = await initiateMultipartUpload(s3Key, contentType ?? 'application/octet-stream')

    // Save transfer record
    const expiryHours = parseInt(process.env.DEFAULT_EXPIRY_HOURS ?? '24', 10)
    const now = new Date().toISOString()
    const transfer: Transfer = {
      fileId,
      walletId,
      fileName,
      fileSizeBytes,
      billableGB: pricing.billableGB,
      downloadSlots,
      downloadsUsed: 0,
      recipientEmail,
      amountDeducted: pricing.totalPaise,
      storageCostPaise: pricing.storageCostPaise,
      downloadCostPaise: pricing.downloadCostPaise,
      status: 'pending',
      s3Key,
      expiryTime: new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString(),
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
        downloadSlots,
        storageCostPaise: pricing.storageCostPaise,
        downloadCostPaise: pricing.downloadCostPaise,
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
        s3Key,
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
