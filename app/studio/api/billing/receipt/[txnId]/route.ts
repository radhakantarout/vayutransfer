import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { renderReceiptPdf } from '@/lib/studio/receiptPdf'
import { sendStudioReceiptEmail } from '@/lib/aws/ses'
import { formatTxnLabel } from '@/lib/studio/receiptLabel'
import type { Studio, StudioTransaction, StudioUser } from '@/types/studio'

// Regenerates the PDF from the stored transaction on every request rather
// than storing a copy anywhere — no extra storage cost, and the PDF always
// reflects the latest receiptPdf.tsx layout even for old transactions.
// ?download=1 forces a Save-As instead of opening inline in the browser.
export async function GET(req: NextRequest, { params }: { params: { txnId: string } }) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role) || !auth.studioId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const txn = await studioGetItem<StudioTransaction>(TABLES.transactions, { txnId: params.txnId })
    // Scoped to the caller's own studio — never trust a bare txnId lookup
    // across tenants.
    if (!txn || txn.studioId !== auth.studioId || txn.status !== 'success') {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const studio = await studioGetItem<Studio>(TABLES.studios, { studioId: auth.studioId })
    if (!studio) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const pdf = await renderReceiptPdf(studio.name, txn)
    const download = req.nextUrl.searchParams.get('download') === '1'

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="VayuStudios-Receipt-${txn.txnId.slice(0, 8)}.pdf"`,
      },
    })
  } catch (err) {
    console.error('[billing/receipt GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

// Resends the same receipt email on demand ("Email me this receipt" in
// Billing history) — reuses the exact pipeline billing/verify already uses.
export async function POST(req: NextRequest, { params }: { params: { txnId: string } }) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role) || !auth.studioId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const txn = await studioGetItem<StudioTransaction>(TABLES.transactions, { txnId: params.txnId })
    if (!txn || txn.studioId !== auth.studioId || txn.status !== 'success') {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const [studio, adminUser] = await Promise.all([
      studioGetItem<Studio>(TABLES.studios, { studioId: auth.studioId }),
      studioGetItem<StudioUser>(TABLES.users, { userId: auth.userId }),
    ])
    if (!studio || !adminUser?.email) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const pdf = await renderReceiptPdf(studio.name, txn)
    await sendStudioReceiptEmail(adminUser.email, studio.name, pdf, formatTxnLabel(txn), txn.amountPaise)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[billing/receipt POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
