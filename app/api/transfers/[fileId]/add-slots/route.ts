import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getUserById } from '@/lib/users'
import { getItem, updateItem } from '@/lib/aws/dynamodb'
import { deductFromWallet } from '@/lib/wallet'
import { getDownloadSlotCostPaise } from '@/lib/pricing'
import { logAudit } from '@/lib/audit'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import {
  FREE_DOWNLOAD_THRESHOLD_BYTES,
  FREE_DOWNLOAD_EXTRA_SLOT_PAISE,
} from '@/constants/pricing'
import type { ApiResponse, Transfer } from '@/types'

const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'

export async function POST(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'UNAUTHORIZED', message: 'Sign in to add download slots' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const slots = Number(body.slots)
    if (!Number.isInteger(slots) || slots < 1 || slots > 20) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'INVALID_INPUT', message: 'slots must be between 1 and 20' },
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

    // Verify ownership
    const user = await getUserById(session.user.id)
    if (!user || transfer.walletId !== user.walletId) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'FORBIDDEN', message: 'This transfer does not belong to you' },
        { status: 403 }
      )
    }

    // Expired transfers cannot be extended
    if (transfer.status === 'expired' || new Date(transfer.expiryTime) < new Date()) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'TRANSFER_EXPIRED', message: 'Expired transfers cannot be extended' },
        { status: 400 }
      )
    }

    // Cost: for <200MB files extra slots cost FREE_DOWNLOAD_EXTRA_SLOT_PAISE each;
    // for larger files use the normal per-slot rate for that size tier.
    const perSlotPaise = transfer.fileSizeBytes <= FREE_DOWNLOAD_THRESHOLD_BYTES
      ? FREE_DOWNLOAD_EXTRA_SLOT_PAISE
      : getDownloadSlotCostPaise(transfer.fileSizeBytes)

    const totalCostPaise = perSlotPaise * slots

    // Deduct wallet (throws INSUFFICIENT_BALANCE if short)
    try {
      await deductFromWallet(user.walletId, totalCostPaise, fileId)
    } catch (err) {
      if (err instanceof Error && err.message === 'INSUFFICIENT_BALANCE') {
        return NextResponse.json<ApiResponse<never>>(
          { success: false, error: 'INSUFFICIENT_BALANCE', message: 'Insufficient wallet balance' },
          { status: 402 }
        )
      }
      throw err
    }

    // Atomically add slots and reactivate if exhausted
    try {
      await updateItem(
        TRANSFERS_TABLE,
        { fileId },
        'ADD downloadSlots :slots SET #s = :active, updatedAt = :now',
        {
          ':slots': slots,
          ':active': 'active',
          ':now': new Date().toISOString(),
          ':exhausted': 'exhausted',
        },
        '#s = :active OR #s = :exhausted',
        { '#s': 'status' }
      )
    } catch (err) {
      // Condition failed = status was something other than active/exhausted
      if (err instanceof ConditionalCheckFailedException) {
        await deductFromWallet(user.walletId, -totalCostPaise, fileId) // refund
        return NextResponse.json<ApiResponse<never>>(
          { success: false, error: 'INVALID_STATE', message: 'Transfer cannot be extended in its current state' },
          { status: 400 }
        )
      }
      throw err
    }

    void logAudit({
      eventType: 'SLOTS_ADDED',
      actor: 'user',
      outcome: 'success',
      walletId: user.walletId,
      fileId,
      amountPaise: totalCostPaise,
      metadata: { slotsAdded: slots, perSlotPaise },
    })

    return NextResponse.json<ApiResponse<{ slotsAdded: number; costPaise: number }>>({
      success: true,
      data: { slotsAdded: slots, costPaise: totalCostPaise },
    })
  } catch (err) {
    console.error('[add-slots]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to add slots' },
      { status: 500 }
    )
  }
}
