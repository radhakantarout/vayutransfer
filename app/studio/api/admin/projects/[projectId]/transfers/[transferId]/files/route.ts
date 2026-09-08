import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { getTransferFiles } from '@/lib/studio/transferBatch'
import type { StudioTransfer } from '@/types/studio'

// Lists a transfer's files — for a single-file transfer this is always a
// one-element array synthesized from the transfer's own scalar fields; for
// a batch it's the real child rows. Used by My Transfers' detail panel to
// expand a batch's file list on demand.
export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string; transferId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    const { projectId, transferId } = params
    const transfer = await studioGetItem<StudioTransfer>(TABLES.transfers, { projectId, transferId })
    if (!transfer || transfer.studioId !== auth.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    const files = await getTransferFiles(transfer)
    return NextResponse.json({ success: true, data: files })
  } catch (err) {
    console.error('[transfers files GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
