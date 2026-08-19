import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getUserById } from '@/lib/users'
import { getItem, updateItem } from '@/lib/aws/dynamodb'
import { sendReceiveRequestInviteEmail } from '@/lib/aws/ses'
import type { ApiResponse, ReceiveRequest } from '@/types'

const RECEIVE_REQUESTS_TABLE = process.env.DYNAMO_RECEIVE_REQUESTS_TABLE ?? 'vayu-receive-requests'
const MAX_TOTAL_INVITED = 20

// Lets the requester invite more people after the fact, from the "Invite
// People" tab on the request-created screen — separate from the initial
// invitedEmails list set at creation time (POST /api/receive-requests).
export async function POST(
  req: NextRequest,
  { params }: { params: { requestId: string } }
) {
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

    const { requestId } = params
    const receiveRequest = await getItem<ReceiveRequest>(RECEIVE_REQUESTS_TABLE, { requestId })
    if (!receiveRequest || receiveRequest.walletId !== user.walletId) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'NOT_FOUND', message: 'Request not found' },
        { status: 404 }
      )
    }

    const body = await req.json().catch(() => ({})) as { emails?: string[] }
    const existing = receiveRequest.invitedEmails ?? []
    const newEmails = (body.emails ?? [])
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e && !existing.includes(e))
      .slice(0, Math.max(0, MAX_TOTAL_INVITED - existing.length))

    if (newEmails.length === 0) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'INVALID_INPUT', message: 'No new email addresses to invite' },
        { status: 400 }
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const receiveLink = `${appUrl}/receive/${requestId}`
    const title = receiveRequest.requestTitle ?? 'some files'
    for (const email of newEmails) {
      sendReceiveRequestInviteEmail(email, user.name, title, receiveLink, receiveRequest.message)
        .catch((e) => console.error('[ses] receive request invite email failed', e))
    }

    await updateItem(
      RECEIVE_REQUESTS_TABLE,
      { requestId },
      'SET invitedEmails = :emails, accessMode = :mode',
      { ':emails': [...existing, ...newEmails], ':mode': 'invited' }
    )

    return NextResponse.json<ApiResponse<{ invited: string[] }>>({
      success: true,
      data: { invited: newEmails },
    })
  } catch (err) {
    console.error('[receive-requests invite POST]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to send invites' },
      { status: 500 }
    )
  }
}
