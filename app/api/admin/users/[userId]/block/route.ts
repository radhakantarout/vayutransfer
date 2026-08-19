import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminJWT } from '@/lib/adminAuth'
import { getItem, updateItem } from '@/lib/aws/dynamodb'
import { sendAccountBlockedEmail } from '@/lib/aws/ses'
import { logAudit } from '@/lib/audit'
import type { ApiResponse } from '@/types'
import type { User } from '@/lib/users'

const USERS_TABLE = process.env.DYNAMO_USERS_TABLE ?? 'vayu-users'

// Full lockout — enforced at sign-in (lib/auth.ts's signIn callback denies
// the session outright for status === 'blocked'), not per-route.
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
    const reason = body.reason?.trim().slice(0, 500) || 'Blocked by platform admin'

    const user = await getItem<User>(USERS_TABLE, { userId })
    if (!user) {
      return NextResponse.json<ApiResponse<never>>({ success: false, error: 'NOT_FOUND', message: 'User not found' }, { status: 404 })
    }

    const now = new Date().toISOString()
    await updateItem(
      USERS_TABLE,
      { userId },
      'SET #s = :blocked, blockedAt = :now, blockedReason = :reason',
      { ':blocked': 'blocked', ':now': now, ':reason': reason },
      undefined,
      { '#s': 'status' }
    )

    sendAccountBlockedEmail(user.email, user.name, reason)
      .catch((e) => console.error('[ses] account blocked email failed', e))

    void logAudit({
      eventType: 'USER_BLOCKED',
      actor: 'admin',
      outcome: 'success',
      walletId: user.walletId,
      metadata: { userId, reason },
    })

    return NextResponse.json<ApiResponse<{ ok: true }>>({ success: true, data: { ok: true } })
  } catch (err) {
    console.error('[admin/users/:userId/block]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to block user' },
      { status: 500 }
    )
  }
}
