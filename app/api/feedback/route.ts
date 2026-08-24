import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getItem, putItem } from '@/lib/aws/dynamodb'
import { resolveOwnWalletId } from '@/lib/walletAuth'
import type { ApiResponse, Feedback, Transfer, ReceiveRequest } from '@/types'

const FEEDBACK_TABLE = process.env.DYNAMO_FEEDBACK_TABLE ?? 'vayu-feedback'
const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
const RECEIVE_REQUESTS_TABLE = process.env.DYNAMO_RECEIVE_REQUESTS_TABLE ?? 'vayu-receive-requests'

const VALID_ROLES: Feedback['role'][] = ['sender', 'downloader', 'requester', 'uploader']

// Public — no auth required. Two of the four roles (downloader, uploader)
// are always fully anonymous with no VayuTransfer account at all, so this
// can't be gated behind a session the way most other API routes are.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { subjectType, subjectId, role, rating, comment } = body as {
      subjectType?: string
      subjectId?: string
      role?: string
      rating?: number
      comment?: string
    }

    if (
      (subjectType !== 'transfer' && subjectType !== 'receiveRequest') ||
      typeof subjectId !== 'string' || !subjectId ||
      typeof role !== 'string' || !VALID_ROLES.includes(role as Feedback['role']) ||
      typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5
    ) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'INVALID_INPUT', message: 'Invalid feedback payload' },
        { status: 400 }
      )
    }

    // subjectId must point at a real record — keeps the table free of
    // garbage submitted against made-up ids.
    const exists = subjectType === 'transfer'
      ? await getItem<Transfer>(TRANSFERS_TABLE, { fileId: subjectId })
      : await getItem<ReceiveRequest>(RECEIVE_REQUESTS_TABLE, { requestId: subjectId })
    if (!exists) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'NOT_FOUND', message: 'Transfer or request not found' },
        { status: 404 }
      )
    }

    const walletId = await resolveOwnWalletId()

    const feedback: Feedback = {
      feedbackId: uuidv4(),
      subjectType,
      subjectId,
      role: role as Feedback['role'],
      rating,
      comment: typeof comment === 'string' && comment.trim() ? comment.trim().slice(0, 500) : undefined,
      walletId: walletId ?? undefined,
      createdAt: new Date().toISOString(),
    }
    await putItem(FEEDBACK_TABLE, feedback)

    return NextResponse.json<ApiResponse<{ feedbackId: string }>>({
      success: true,
      data: { feedbackId: feedback.feedbackId },
    })
  } catch (err) {
    console.error('[feedback]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to submit feedback' },
      { status: 500 }
    )
  }
}
