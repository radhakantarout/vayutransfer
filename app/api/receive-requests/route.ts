import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getUserById } from '@/lib/users'
import { putItem, queryItems } from '@/lib/aws/dynamodb'
import { logAudit } from '@/lib/audit'
import { sendReceiveRequestInviteEmail } from '@/lib/aws/ses'
import { EXPIRY_DAY_OPTIONS, DEFAULT_EXPIRY_DAYS, MAX_FILE_SIZE_GB } from '@/constants/pricing'
import type { ApiResponse, ReceiveRequest } from '@/types'

const RECEIVE_REQUESTS_TABLE = process.env.DYNAMO_RECEIVE_REQUESTS_TABLE ?? 'vayu-receive-requests'

// Receive-links are a signed-in-only feature — the wallet that pays for the
// eventual upload needs to be a real, addressable account (so the
// insufficient-balance nudge email has somewhere to go), unlike normal
// sends which also work anonymously off a cookie-scoped wallet.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'UNAUTHORIZED', message: 'Sign in to create a receive link' },
        { status: 401 }
      )
    }
    const user = await getUserById(session.user.id)
    if (!user) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'UNAUTHORIZED', message: 'User not found' },
        { status: 401 }
      )
    }

    const body = await req.json().catch(() => ({})) as {
      requestTitle?: string
      message?: string
      expiryDays?: number
      maxSizeBytes?: number
      accessMode?: 'anyone' | 'invited'
      invitedEmails?: string[]
      notifyOnUpload?: boolean
    }
    const expiryDays = EXPIRY_DAY_OPTIONS.includes(body.expiryDays as typeof EXPIRY_DAY_OPTIONS[number])
      ? body.expiryDays!
      : DEFAULT_EXPIRY_DAYS

    const platformMaxBytes = MAX_FILE_SIZE_GB * 1024 * 1024 * 1024
    const maxSizeBytes = typeof body.maxSizeBytes === 'number' && body.maxSizeBytes > 0
      ? Math.min(body.maxSizeBytes, platformMaxBytes)
      : undefined

    const accessMode = body.accessMode === 'invited' ? 'invited' : 'anyone'
    const invitedEmails = accessMode === 'invited'
      ? (body.invitedEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean).slice(0, 10)
      : undefined

    const requestId = uuidv4()
    const now = new Date().toISOString()
    const receiveRequest: ReceiveRequest = {
      requestId,
      walletId: user.walletId,
      requesterEmail: user.email,
      requestTitle: body.requestTitle?.trim().slice(0, 100) || undefined,
      message: body.message?.slice(0, 500) || undefined,
      maxSizeBytes,
      accessMode,
      invitedEmails,
      notifyOnUpload: body.notifyOnUpload !== false,
      status: 'pending',
      expiryTime: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now,
    }
    await putItem(RECEIVE_REQUESTS_TABLE, receiveRequest)

    void logAudit({
      eventType: 'RECEIVE_REQUEST_CREATED',
      actor: 'user',
      outcome: 'success',
      walletId: user.walletId,
      metadata: { requestId, expiryDays, accessMode, invitedCount: invitedEmails?.length ?? 0 },
    })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const receiveLink = `${appUrl}/receive/${requestId}`

    // Fire-and-forget, same pattern as every other non-blocking notification
    // email in this codebase — doesn't gate the response on SES.
    if (invitedEmails && invitedEmails.length > 0) {
      const title = receiveRequest.requestTitle ?? 'some files'
      for (const email of invitedEmails) {
        sendReceiveRequestInviteEmail(email, user.name, title, receiveLink, receiveRequest.message)
          .catch((e) => console.error('[ses] receive request invite email failed', e))
      }
    }

    return NextResponse.json<ApiResponse<{ requestId: string; receiveLink: string; expiryTime: string }>>({
      success: true,
      data: { requestId, receiveLink, expiryTime: receiveRequest.expiryTime },
    })
  } catch (err) {
    console.error('[receive-requests POST]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to create receive link' },
      { status: 500 }
    )
  }
}

// Live-tracking list for the requester's own dashboard/transfers page —
// polled every few seconds while any request is pending/uploading.
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'UNAUTHORIZED', message: 'Sign in required' },
        { status: 401 }
      )
    }
    const user = await getUserById(session.user.id)
    if (!user) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'UNAUTHORIZED', message: 'User not found' },
        { status: 401 }
      )
    }

    const requests = await queryItems<ReceiveRequest>(
      RECEIVE_REQUESTS_TABLE,
      'walletId-index',
      'walletId = :w',
      { ':w': user.walletId }
    )
    requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    return NextResponse.json<ApiResponse<{ requests: ReceiveRequest[] }>>({
      success: true,
      data: { requests },
    })
  } catch (err) {
    console.error('[receive-requests GET]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to load receive requests' },
      { status: 500 }
    )
  }
}
