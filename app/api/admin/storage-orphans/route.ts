import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminJWT } from '@/lib/adminAuth'
import { getCachedR2Orphans } from '@/lib/platformStats'
import type { ApiResponse } from '@/types'
import type { PlatformOrphanStats } from '@/lib/platformStats'

// Reads the cached breakdown from the last "Sync Now" — same cache
// app/api/admin/stats reads for the aggregate totals, just the fuller
// per-user breakdown. Never scans R2 live (that only happens on sync).
export async function GET(req: NextRequest) {
  const auth = await verifyAdminJWT(req)
  if (!auth) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  try {
    const orphans = await getCachedR2Orphans()
    return NextResponse.json<ApiResponse<PlatformOrphanStats | null>>({ success: true, data: orphans })
  } catch (err) {
    console.error('[admin/storage-orphans]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to load orphan storage stats' },
      { status: 500 }
    )
  }
}
