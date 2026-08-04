import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import { formatTxnLabel } from '@/lib/studio/receiptLabel'
import type { StudioTransaction } from '@/types/studio'

// Lists a studio's successful billing transactions, newest first, for the
// Settings > Billing "Billing history" list. Reads via the
// studioId-createdAt-index GSI (added alongside this route) rather than a
// full-table scan.
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role) || !auth.studioId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const txns = await studioQueryByIndex<StudioTransaction>(
      TABLES.transactions,
      'studioId-createdAt-index',
      'studioId = :sid',
      { ':sid': auth.studioId },
      undefined,
      100
    )

    const data = txns
      .filter((t) => t.status === 'success')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((t) => ({
        txnId: t.txnId,
        type: t.type,
        label: formatTxnLabel(t),
        amountPaise: t.amountPaise,
        createdAt: t.createdAt,
      }))

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[billing/history]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
