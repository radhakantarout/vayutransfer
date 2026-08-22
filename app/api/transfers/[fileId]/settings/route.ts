import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getUserById } from '@/lib/users'
import { getItem, updateItem } from '@/lib/aws/dynamodb'
import { logAudit } from '@/lib/audit'
import type { ApiResponse, Transfer } from '@/types'

const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
const BCRYPT_ROUNDS = 10

// Rename (displayName) and password protection — both live-editable
// settings on an already-active transfer, same ownership check as
// extend-expiry. Password is validated server-side only; the client never
// sees passwordHash (never selected/returned here).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'UNAUTHORIZED', message: 'Sign in to manage this transfer' },
        { status: 401 }
      )
    }

    const { fileId } = params
    const transfer = await getItem<Transfer>(TRANSFERS_TABLE, { fileId })
    if (!transfer) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'NOT_FOUND', message: 'Transfer not found' },
        { status: 404 }
      )
    }

    const user = await getUserById(session.user.id)
    if (!user || transfer.walletId !== user.walletId) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'FORBIDDEN', message: 'This transfer does not belong to you' },
        { status: 403 }
      )
    }

    const body = await req.json() as {
      displayName?: string
      passwordEnabled?: boolean
      password?: string   // plain text — hashed here, never stored/logged as-is
    }

    const setParts: string[] = []
    const values: Record<string, unknown> = {}
    const names: Record<string, string> = {}

    if (typeof body.displayName === 'string') {
      const trimmed = body.displayName.trim().slice(0, 200)
      setParts.push('displayName = :displayName')
      values[':displayName'] = trimmed.length > 0 ? trimmed : transfer.fileName
    }

    if (body.passwordEnabled === false) {
      setParts.push('passwordEnabled = :false')
      values[':false'] = false
    } else if (body.passwordEnabled === true) {
      if (!body.password || body.password.length < 4) {
        return NextResponse.json<ApiResponse<never>>(
          { success: false, error: 'INVALID_INPUT', message: 'Password must be at least 4 characters' },
          { status: 400 }
        )
      }
      const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS)
      setParts.push('passwordEnabled = :true', '#hash = :hash')
      values[':true'] = true
      values[':hash'] = passwordHash
      names['#hash'] = 'passwordHash'
    }

    if (setParts.length === 0) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'MISSING_PARAMS', message: 'Nothing to update' },
        { status: 400 }
      )
    }

    await updateItem(
      TRANSFERS_TABLE,
      { fileId },
      `SET ${setParts.join(', ')}`,
      values,
      undefined,
      Object.keys(names).length > 0 ? names : undefined
    )

    void logAudit({
      eventType: 'TRANSFER_SETTINGS_UPDATED',
      actor: 'user',
      outcome: 'success',
      walletId: user.walletId,
      fileId,
      metadata: {
        displayNameChanged: typeof body.displayName === 'string',
        passwordEnabled: body.passwordEnabled,
      },
    })

    return NextResponse.json<ApiResponse<{ ok: true }>>({ success: true, data: { ok: true } })
  } catch (err) {
    console.error('[transfers/settings]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to update transfer settings' },
      { status: 500 }
    )
  }
}
