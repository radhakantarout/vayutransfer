import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getUserById } from '@/lib/users'
import { getItem, updateItem } from '@/lib/aws/dynamodb'
import { deductFromWallet } from '@/lib/wallet'
import { getExtensionCostPaise, formatPaise } from '@/lib/pricing'
import { EXPIRY_DAY_OPTIONS, MAX_EXPIRY_DAYS_FROM_UPLOAD } from '@/constants/pricing'
import { logAudit } from '@/lib/audit'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import type { ApiResponse, Transfer } from '@/types'

const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'

// The only valid "extend to" targets — one step past each existing choice,
// capped at MAX_EXPIRY_DAYS_FROM_UPLOAD (19) so the app can never promise
// more than the R2 bucket's own hard 20-day-from-upload delete allows.
const EXTEND_TARGETS = [...EXPIRY_DAY_OPTIONS, MAX_EXPIRY_DAYS_FROM_UPLOAD] as const

// Unlike add-slots, this deliberately ALLOWS an already expired-by-time
// transfer to be revived — the file itself still physically exists in R2
// right up until the bucket's day-20 delete, so as long as the requested
// target still lands before that, extending is meaningful and safe.
export async function POST(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'UNAUTHORIZED', message: 'Sign in to extend a link' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const targetDays = Number(body.targetDays)
    if (!EXTEND_TARGETS.includes(targetDays as typeof EXTEND_TARGETS[number])) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'INVALID_INPUT', message: `targetDays must be one of ${EXTEND_TARGETS.join(', ')}` },
        { status: 400 }
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

    // Never a completed-but-not-uploaded (failed) transfer — no object exists.
    if (transfer.status === 'failed') {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'INVALID_STATE', message: 'This upload never completed and cannot be extended' },
        { status: 400 }
      )
    }
    if (targetDays <= (transfer.expiryDays ?? 0)) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'INVALID_INPUT', message: 'targetDays must be longer than the current retention' },
        { status: 400 }
      )
    }

    const newExpiryTime = new Date(new Date(transfer.createdAt).getTime() + targetDays * 24 * 60 * 60 * 1000)
    if (newExpiryTime.getTime() <= Date.now()) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'TOO_OLD', message: 'This link is too old to extend any further' },
        { status: 400 }
      )
    }

    // Cost scales with how many steps are actually being crossed (e.g.
    // jumping straight from 3→19 days costs 3x a single 3→7 step), not a
    // flat per-request fee regardless of how far ahead the target is.
    const stepsCrossed = EXTEND_TARGETS.indexOf(targetDays as typeof EXTEND_TARGETS[number])
      - EXTEND_TARGETS.indexOf((transfer.expiryDays ?? EXPIRY_DAY_OPTIONS[0]) as typeof EXTEND_TARGETS[number])
    const costPaise = getExtensionCostPaise(transfer.fileSizeBytes) * Math.max(1, stepsCrossed)
    if (costPaise > 0) {
      try {
        await deductFromWallet(user.walletId, costPaise, fileId)
      } catch (err) {
        if (err instanceof Error && err.message === 'INSUFFICIENT_BALANCE') {
          return NextResponse.json<ApiResponse<never>>(
            { success: false, error: 'INSUFFICIENT_BALANCE', message: 'Insufficient wallet balance' },
            { status: 402 }
          )
        }
        throw err
      }
    }

    try {
      await updateItem(
        TRANSFERS_TABLE,
        { fileId },
        'SET expiryDays = :days, expiryTime = :expiry, #s = :active, updatedAt = :now, amountDeducted = amountDeducted + :cost',
        {
          ':days': targetDays,
          ':expiry': newExpiryTime.toISOString(),
          ':active': 'active',
          ':now': new Date().toISOString(),
          ':cost': costPaise,
          ':notFailed': 'failed',
        },
        '#s <> :notFailed',
        { '#s': 'status' }
      )
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        if (costPaise > 0) await deductFromWallet(user.walletId, -costPaise, fileId) // refund
        return NextResponse.json<ApiResponse<never>>(
          { success: false, error: 'INVALID_STATE', message: 'Transfer cannot be extended in its current state' },
          { status: 400 }
        )
      }
      throw err
    }

    void logAudit({
      eventType: 'EXPIRY_EXTENDED',
      actor: 'user',
      outcome: 'success',
      walletId: user.walletId,
      fileId,
      amountPaise: costPaise,
      metadata: { fromDays: transfer.expiryDays, toDays: targetDays, newExpiryTime: newExpiryTime.toISOString() },
    })

    return NextResponse.json<ApiResponse<{
      expiryDays: number
      expiryTime: string
      costPaise: number
      costFormatted: string
    }>>({
      success: true,
      data: { expiryDays: targetDays, expiryTime: newExpiryTime.toISOString(), costPaise, costFormatted: formatPaise(costPaise) },
    })
  } catch (err) {
    console.error('[extend-expiry]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to extend transfer' },
      { status: 500 }
    )
  }
}
