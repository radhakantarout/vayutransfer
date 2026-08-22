import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminJWT } from '@/lib/adminAuth'
import { getItem, updateItem } from '@/lib/aws/dynamodb'
import { sendAccountWarningEmail } from '@/lib/aws/ses'
import { logAudit } from '@/lib/audit'
import type { ApiResponse } from '@/types'
import type { User } from '@/lib/users'

const USERS_TABLE = process.env.DYNAMO_USERS_TABLE ?? 'vayu-users'
const MAX_WARNINGS = 3

// Admin-triggered only — never automatic. Caps at 3; the response flags
// readyToBlock so the admin UI can prompt to block, but blocking always
// stays a separate explicit click (app/api/admin/users/[userId]/block).
export async function POST(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const auth = await verifyAdminJWT(req)
  if (!auth) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  try {
    const { userId } = params
    const body = await req.json().catch(() => ({})) as { reason?: string }
    const reason = body.reason?.trim().slice(0, 500)
    if (!reason) {
      return NextResponse.json<ApiResponse<never>>({ success: false, error: 'INVALID_INPUT', message: 'A reason is required' }, { status: 400 })
    }

    const user = await getItem<User>(USERS_TABLE, { userId })
    if (!user) {
      return NextResponse.json<ApiResponse<never>>({ success: false, error: 'NOT_FOUND', message: 'User not found' }, { status: 404 })
    }

    const warningNumber = Math.min((user.warningCount ?? 0) + 1, MAX_WARNINGS)
    const now = new Date().toISOString()

    await updateItem(
      USERS_TABLE,
      { userId },
      'SET warningCount = :c, lastWarningAt = :now, #s = :warned',
      { ':c': warningNumber, ':now': now, ':warned': 'warned' },
      undefined,
      { '#s': 'status' }
    )

    sendAccountWarningEmail(user.email, user.name, reason, warningNumber)
      .catch((e) => console.error('[ses] account warning email failed', e))

    void logAudit({
      eventType: 'USER_WARNED',
      actor: 'admin',
      outcome: 'success',
      walletId: user.walletId,
      metadata: { userId, reason, warningNumber },
    })

    return NextResponse.json<ApiResponse<{ warningNumber: number; readyToBlock: boolean }>>({
      success: true,
      data: { warningNumber, readyToBlock: warningNumber >= MAX_WARNINGS },
    })
  } catch (err) {
    console.error('[admin/users/:userId/warn]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to send warning' },
      { status: 500 }
    )
  }
}
