import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminJWT } from '@/lib/adminAuth'
import { getItem, updateItem } from '@/lib/aws/dynamodb'
import { sendAccountUnblockedEmail } from '@/lib/aws/ses'
import { logAudit } from '@/lib/audit'
import type { ApiResponse } from '@/types'
import type { User } from '@/lib/users'

const USERS_TABLE = process.env.DYNAMO_USERS_TABLE ?? 'vayu-users'

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
    const user = await getItem<User>(USERS_TABLE, { userId })
    if (!user) {
      return NextResponse.json<ApiResponse<never>>({ success: false, error: 'NOT_FOUND', message: 'User not found' }, { status: 404 })
    }

    await updateItem(
      USERS_TABLE,
      { userId },
      'SET #s = :active, warningCount = :zero REMOVE blockedAt, blockedReason, lastWarningAt',
      { ':active': 'active', ':zero': 0 },
      undefined,
      { '#s': 'status' }
    )

    sendAccountUnblockedEmail(user.email, user.name)
      .catch((e) => console.error('[ses] account unblocked email failed', e))

    void logAudit({
      eventType: 'USER_UNBLOCKED',
      actor: 'admin',
      outcome: 'success',
      walletId: user.walletId,
      metadata: { userId },
    })

    return NextResponse.json<ApiResponse<{ ok: true }>>({ success: true, data: { ok: true } })
  } catch (err) {
    console.error('[admin/users/:userId/unblock]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to unblock user' },
      { status: 500 }
    )
  }
}
