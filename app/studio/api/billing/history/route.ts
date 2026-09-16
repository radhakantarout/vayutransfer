import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import { formatTxnLabel } from '@/lib/studio/receiptLabel'
import { currentStorageBytes, activeStorageGrantBytes, aiCreditsUsed, aiCreditsQuota } from '@/lib/studio/quota'
import { formatPaiseAsRupees } from '@/constants/studioPricing'
import type { Studio, StudioTransaction } from '@/types/studio'

// CSV escaping — wrap in quotes and double any embedded quotes whenever a
// field could contain a comma/quote/newline (transaction labels can, e.g.
// `"461 AI credits (₹1,234.00)"`).
function csvCell(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Lists a studio's successful billing transactions, newest first, for the
// Settings > Billing "Billing history" list, and (via the shared
// UsageBillingPanel component) Moments' Profile usage screen too. Reads via
// the studioId-createdAt-index GSI (added alongside this route) rather than
// a full-table scan.
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    // Same isIndividual carve-out as billing/ai-search-topup — a Moments
    // personal Studio is always role CLIENT, never ADMIN/OWNER, but still
    // needs to see its own billing history. Real studios keep the
    // ADMIN/OWNER-only rule unchanged.
    const studio = await studioGetItem<Studio>(TABLES.studios, { studioId: auth.studioId })
    if (!studio) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    if (!studio.isIndividual && !['ADMIN', 'OWNER'].includes(auth.role)) {
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

    if (req.nextUrl.searchParams.get('format') === 'csv') {
      const lines = [
        ['Date', 'Type', 'Description', 'Amount'].map(csvCell).join(','),
        ...data.map((t) => [
          new Date(t.createdAt).toLocaleString('en-IN'),
          t.type,
          t.label,
          formatPaiseAsRupees(t.amountPaise),
        ].map(csvCell).join(',')),
        '',
        `Exported,${new Date().toLocaleString('en-IN')}`,
        `Current storage usage,${(currentStorageBytes(studio) / (1024 ** 3)).toFixed(2)} GB of ${(activeStorageGrantBytes(studio) / (1024 ** 3)).toFixed(2)} GB`,
        `Current AI-credit usage,${aiCreditsUsed(studio)} of ${aiCreditsQuota(studio)}`,
      ]
      return new NextResponse(lines.join('\r\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="VayuStudios-Billing-History-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      })
    }

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[billing/history]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
