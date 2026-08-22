import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminJWT } from '@/lib/adminAuth'
import { syncR2Stats } from '@/lib/platformStats'
import type { ApiResponse } from '@/types'

// The mockup's "Sync Now" button — live ListObjectsV2 scan of the R2
// bucket, cached to vayu-platform-stats so the Overview page's own GET
// doesn't have to re-scan the whole bucket on every load.
export async function POST(req: NextRequest) {
  const auth = await verifyAdminJWT(req)
  if (!auth) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  try {
    const stats = await syncR2Stats()
    return NextResponse.json<ApiResponse<typeof stats>>({ success: true, data: stats })
  } catch (err) {
    console.error('[admin/r2-sync]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to sync R2 storage stats' },
      { status: 500 }
    )
  }
}
