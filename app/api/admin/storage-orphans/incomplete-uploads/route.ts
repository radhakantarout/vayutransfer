import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminJWT } from '@/lib/adminAuth'
import { classifyR2IncompleteUploads } from '@/lib/r2IncompleteUploads'
import type { ApiResponse } from '@/types'
import type { IncompleteUploadUserGroup } from '@/lib/r2IncompleteUploads'

// Always live, never cached in DynamoDB — a real uploadId here is ~340
// characters (Cloudflare R2's multipart upload IDs are long opaque tokens,
// nothing like a UUID), and a few hundred of them in one item blew straight
// past DynamoDB's 400KB item-size limit the first time this ran against a
// real bucket (824 uploads => ~480KB). ListMultipartUploads itself is cheap
// (paginated, no ListParts), so recomputing this on every page load is fine
// — same tradeoff admin/users already makes for its own live per-request scans.
export async function GET(req: NextRequest) {
  const auth = await verifyAdminJWT(req)
  if (!auth) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  try {
    const { groups, totalCount } = await classifyR2IncompleteUploads()
    return NextResponse.json<ApiResponse<{ groups: IncompleteUploadUserGroup[]; totalCount: number; asOf: string }>>({
      success: true,
      data: { groups, totalCount, asOf: new Date().toISOString() },
    })
  } catch (err) {
    console.error('[admin/storage-orphans/incomplete-uploads]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to load incomplete uploads' },
      { status: 500 }
    )
  }
}
