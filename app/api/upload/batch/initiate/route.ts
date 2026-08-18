import { NextRequest, NextResponse } from 'next/server'
import { getItem, queryItems } from '@/lib/aws/dynamodb'
import { createBatchTransfer, type IncomingBatchFile } from '@/lib/transferBatch'
import { getWalletBalance } from '@/lib/wallet'
import { logAudit } from '@/lib/audit'
import {
  MAX_FILE_SIZE_GB,
  RATE_LIMIT_UPLOADS_PER_HOUR,
  EXPIRY_DAY_OPTIONS,
  DEFAULT_EXPIRY_DAYS,
} from '@/constants/pricing'
import type { ApiResponse, Wallet, AuditEvent } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      walletId?: string
      files?: IncomingBatchFile[]
      recipientEmails?: string[]
      message?: string
      senderNotifyEmail?: string
      expiryDays?: number
    }

    const { walletId, files, recipientEmails, message, senderNotifyEmail } = body
    const expiryDays = EXPIRY_DAY_OPTIONS.includes(body.expiryDays as typeof EXPIRY_DAY_OPTIONS[number])
      ? body.expiryDays!
      : DEFAULT_EXPIRY_DAYS

    if (!walletId || !files || files.length === 0) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'MISSING_PARAMS', message: 'walletId, files are required' },
        { status: 400 }
      )
    }
    if (files.some((f) => !f.fileName || !f.fileSizeBytes || f.fileSizeBytes <= 0)) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'INVALID_INPUT', message: 'Every file needs a fileName and a positive fileSizeBytes' },
        { status: 400 }
      )
    }

    const totalSizeBytes = files.reduce((sum, f) => sum + f.fileSizeBytes, 0)
    const maxBytes = MAX_FILE_SIZE_GB * 1024 * 1024 * 1024
    if (totalSizeBytes > maxBytes) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'FILE_TOO_LARGE', message: `Total selection exceeds ${MAX_FILE_SIZE_GB}GB limit` },
        { status: 400 }
      )
    }

    const walletsTable = process.env.DYNAMO_WALLETS_TABLE ?? 'vayu-wallets'
    const wallet = await getItem<Wallet>(walletsTable, { walletId })
    if (!wallet) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'WALLET_NOT_FOUND', message: 'Wallet not found' },
        { status: 404 }
      )
    }

    // Rate limit: max 10 uploads/hour per walletId (a batch counts as one)
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

    const balanceBefore = await getWalletBalance(walletId)
    const { batchId, files: fileResults, pricing, chunkSizeBytes } = await createBatchTransfer({
      walletId, files, recipientEmails, message, senderNotifyEmail, expiryDays,
    })

    void logAudit({
      eventType: 'UPLOAD_INITIATED',
      actor: 'user',
      outcome: 'success',
      walletId,
      fileId: batchId,
      amountPaise: pricing.totalPaise,
      metadata: {
        fileCount: files.length,
        totalSizeBytes,
        billableGB: pricing.billableGB,
        totalDeductedPaise: pricing.totalPaise,
        balanceBeforePaise: balanceBefore,
        balanceAfterPaise: balanceBefore - pricing.totalPaise,
      },
    })

    return NextResponse.json<ApiResponse<{
      batchId: string
      files: typeof fileResults
      chunkSizeBytes: number
      priceBreakdown: typeof pricing
    }>>({
      success: true,
      data: { batchId, files: fileResults, chunkSizeBytes, priceBreakdown: pricing },
    })
  } catch (err) {
    console.error('[upload/batch/initiate]', err)
    if (err instanceof Error && (err.message === 'INSUFFICIENT_BALANCE' || err.message === 'WALLET_NOT_FOUND')) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: err.message, message: err.message === 'WALLET_NOT_FOUND' ? 'Wallet not found' : 'Insufficient wallet balance' },
        { status: err.message === 'WALLET_NOT_FOUND' ? 404 : 402 }
      )
    }
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Batch upload initiation failed' },
      { status: 500 }
    )
  }
}
