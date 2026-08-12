import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { MAX_TRANSFER_EXPIRY_DAYS, TRANSFER_EXTEND_DAY_OPTIONS, DEFAULT_TRANSFER_EXPIRY_DAYS } from '@/lib/studio/transferConfig'
import type { StudioTransfer } from '@/types/studio'

// Extends the CURRENT share link in place (same shareToken) — unlike Resend,
// which mints a brand-new token and silently breaks any copy of the link
// already sent to someone. Capped at MAX_TRANSFER_EXPIRY_DAYS from the
// transfer's own createdAt (a product-policy ceiling, not a physical
// storage constraint — see lib/studio/transferConfig.ts).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { projectId: string; transferId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId, transferId } = params
    const { additionalDays } = await req.json().catch(() => ({}))
    if (!TRANSFER_EXTEND_DAY_OPTIONS.includes(additionalDays)) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT', message: 'additionalDays must be 3, 7, or 15' }, { status: 400 })
    }

    const transfer = await studioGetItem<StudioTransfer>(TABLES.transfers, { projectId, transferId })
    if (!transfer || transfer.studioId !== auth.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    if (transfer.status === 'EXPIRED' || transfer.status === 'FAILED') {
      return NextResponse.json(
        { success: false, error: 'CANNOT_EXTEND', message: 'This link has already expired — resend to generate a new one' },
        { status: 409 }
      )
    }

    const currentDays = transfer.expiryDays ?? DEFAULT_TRANSFER_EXPIRY_DAYS
    const newDays = Math.min(currentDays + additionalDays, MAX_TRANSFER_EXPIRY_DAYS)
    if (newDays === currentDays) {
      return NextResponse.json(
        { success: false, error: 'MAX_REACHED', message: `Already at the ${MAX_TRANSFER_EXPIRY_DAYS}-day maximum` },
        { status: 409 }
      )
    }

    const createdAtMs = new Date(transfer.createdAt).getTime()
    const newExpiresAtMs = createdAtMs + newDays * 86400 * 1000
    if (newExpiresAtMs <= Date.now()) {
      // Old enough that even the max cap from createdAt is still in the past
      // — extending in place can't help; a fresh token (Resend) is the only
      // way to bring this link back.
      return NextResponse.json(
        { success: false, error: 'TOO_OLD_TO_EXTEND', message: 'This link expired too long ago to extend — use Resend to generate a new one' },
        { status: 409 }
      )
    }
    const shareExpiresAt = new Date(newExpiresAtMs).toISOString()
    const now = new Date().toISOString()

    await studioUpdateItem(
      TABLES.transfers,
      { projectId, transferId },
      'SET expiryDays = :days, shareExpiresAt = :exp, updatedAt = :now',
      { ':days': newDays, ':exp': shareExpiresAt, ':now': now }
    )

    return NextResponse.json({ success: true, data: { expiryDays: newDays, shareExpiresAt } })
  } catch (err) {
    console.error('[transfers extend PATCH]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
