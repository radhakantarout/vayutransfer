import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { getTransfersByStudio } from '@/lib/studio/transfers'

// Backs the top-level Raw Transfer product page — every existing per-project
// transfer route (create/upload-complete/abort/extend/resend/move/copy/
// import/delete under .../projects/[projectId]/transfers/**) is unchanged
// and still owns all writes; this is purely the studio-wide read used to
// list transfers across every event instead of one at a time.
export async function GET(req: NextRequest) {
  const auth = await verifyStudioJWT(req)
  if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
    return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }
  const studioId = auth.studioId
  if (!studioId) return NextResponse.json({ success: false, error: 'NO_STUDIO' }, { status: 400 })

  const transfers = await getTransfersByStudio(studioId)
  transfers.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  return NextResponse.json({ success: true, data: transfers })
}
