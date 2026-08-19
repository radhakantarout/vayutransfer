import { NextRequest, NextResponse } from 'next/server'
import { getItem, updateItem } from '@/lib/aws/dynamodb'
import { createBatchTransfer, type IncomingBatchFile } from '@/lib/transferBatch'
import { getWalletBalance } from '@/lib/wallet'
import { sendReceiveInsufficientBalanceEmail } from '@/lib/aws/ses'
import { logAudit } from '@/lib/audit'
import { calculatePrice } from '@/lib/pricing'
import { MAX_FILE_SIZE_GB, DEFAULT_EXPIRY_DAYS } from '@/constants/pricing'
import type { ApiResponse, ReceiveRequest } from '@/types'

const RECEIVE_REQUESTS_TABLE = process.env.DYNAMO_RECEIVE_REQUESTS_TABLE ?? 'vayu-receive-requests'
// Throttles the "add funds" nudge email to once per hour per request.
const NUDGE_THROTTLE_MS = 60 * 60 * 1000

export async function POST(
  req: NextRequest,
  { params }: { params: { requestId: string } }
) {
  try {
    const { requestId } = params
    const body = await req.json() as { files?: IncomingBatchFile[] }
    const files = body.files

    if (!files || files.length === 0 || files.some((f) => !f.fileName || !f.fileSizeBytes || f.fileSizeBytes <= 0)) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'INVALID_INPUT', message: 'Every file needs a fileName and a positive fileSizeBytes' },
        { status: 400 }
      )
    }
    const totalSizeBytes = files.reduce((s, f) => s + f.fileSizeBytes, 0)
    if (totalSizeBytes > MAX_FILE_SIZE_GB * 1024 * 1024 * 1024) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'FILE_TOO_LARGE', message: `Total selection exceeds ${MAX_FILE_SIZE_GB}GB limit` },
        { status: 400 }
      )
    }

    const receiveRequest = await getItem<ReceiveRequest>(RECEIVE_REQUESTS_TABLE, { requestId })
    if (!receiveRequest) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'NOT_FOUND', message: 'This receive link does not exist' },
        { status: 404 }
      )
    }
    if (new Date() > new Date(receiveRequest.expiryTime) && receiveRequest.status === 'pending') {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'LINK_EXPIRED', message: 'This receive link has expired' },
        { status: 410 }
      )
    }
    if (receiveRequest.status !== 'pending') {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'NOT_AVAILABLE', message: 'This receive link is no longer accepting uploads' },
        { status: 409 }
      )
    }
    if (receiveRequest.maxSizeBytes && totalSizeBytes > receiveRequest.maxSizeBytes) {
      const maxGB = (receiveRequest.maxSizeBytes / (1024 * 1024 * 1024)).toFixed(1)
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'FILE_TOO_LARGE', message: `This request only accepts up to ${maxGB}GB total` },
        { status: 400 }
      )
    }

    let result
    try {
      result = await createBatchTransfer({
        walletId: receiveRequest.walletId,
        files,
        expiryDays: DEFAULT_EXPIRY_DAYS,
      })
    } catch (err) {
      if (err instanceof Error && err.message === 'INSUFFICIENT_BALANCE') {
        const pricing = calculatePrice(totalSizeBytes)
        const balance = await getWalletBalance(receiveRequest.walletId)

        const nudgeDue = !receiveRequest.lastTopupNudgeAt
          || Date.now() - new Date(receiveRequest.lastTopupNudgeAt).getTime() > NUDGE_THROTTLE_MS
        if (nudgeDue) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
          sendReceiveInsufficientBalanceEmail(receiveRequest.requesterEmail, pricing.totalPaise, balance, `${appUrl}/wallet`)
            .catch((e) => console.error('[ses] receive nudge email failed', e))
          await updateItem(
            RECEIVE_REQUESTS_TABLE,
            { requestId },
            'SET lastTopupNudgeAt = :now',
            { ':now': new Date().toISOString() }
          )
        }

        void logAudit({
          eventType: 'RECEIVE_INSUFFICIENT_BALANCE',
          actor: 'user',
          outcome: 'failure',
          walletId: receiveRequest.walletId,
          metadata: { requestId, neededPaise: pricing.totalPaise, havePaise: balance, nudgeSent: nudgeDue },
        })

        return NextResponse.json<ApiResponse<never>>(
          {
            success: false,
            error: 'INSUFFICIENT_BALANCE',
            message: "The sender's wallet doesn't have enough balance right now. They've been notified — please try again shortly.",
          },
          { status: 402 }
        )
      }
      throw err
    }

    await updateItem(
      RECEIVE_REQUESTS_TABLE,
      { requestId },
      'SET #s = :uploading, resultFileId = :fileId',
      { ':uploading': 'uploading', ':fileId': result.batchId },
      undefined,
      { '#s': 'status' }
    )

    void logAudit({
      eventType: 'RECEIVE_UPLOAD_STARTED',
      actor: 'user',
      outcome: 'success',
      walletId: receiveRequest.walletId,
      fileId: result.batchId,
      amountPaise: result.pricing.totalPaise,
      metadata: { requestId, fileCount: files.length, totalSizeBytes },
    })

    return NextResponse.json<ApiResponse<{
      batchId: string
      files: typeof result.files
      chunkSizeBytes: number
    }>>({
      success: true,
      data: { batchId: result.batchId, files: result.files, chunkSizeBytes: result.chunkSizeBytes },
    })
  } catch (err) {
    console.error('[receive/initiate]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to start upload' },
      { status: 500 }
    )
  }
}
