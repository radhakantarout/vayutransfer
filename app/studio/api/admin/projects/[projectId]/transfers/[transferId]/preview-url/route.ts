import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { getStudioR2SignedViewUrl } from '@/lib/studio/r2'
import type { StudioTransfer } from '@/types/studio'

// Admin-only preview URL — deliberately separate from the public send-token
// route (app/studio/api/transfer/send/[token]/route.ts), which increments
// downloadCount as a side effect. An admin merely previewing a file in the
// detail panel should never count as a recipient download.
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
    if (!transfer.r2Key) {
      return NextResponse.json({ success: false, error: 'NO_FILE' }, { status: 404 })
    }
    const url = await getStudioR2SignedViewUrl(transfer.r2Key)
    return NextResponse.json({ success: true, data: { url } })
  } catch (err) {
    console.error('[transfers preview-url GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
