import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioScanTable, TABLES } from '@/lib/studio/dynamodb'
import type { StudioUser } from '@/types/studio'

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'OWNER') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const url   = new URL(req.url)
    const role  = url.searchParams.get('role')
    const limit = parseInt(url.searchParams.get('limit') ?? '200', 10)

    let users = await studioScanTable<StudioUser>(TABLES.users)

    // Strip password hashes before returning
    users = users.map((u) => ({ ...u, passwordHash: undefined }))

    if (role) users = users.filter((u) => u.role === role)

    // Sort: ADMIN first, then by lastLoginAt desc
    users.sort((a, b) => {
      const roleOrder = ['ADMIN', 'CLIENT', 'PRINT']
      const ra = roleOrder.indexOf(a.role)
      const rb = roleOrder.indexOf(b.role)
      if (ra !== rb) return ra - rb
      return (b.lastLoginAt ?? '').localeCompare(a.lastLoginAt ?? '')
    })

    return NextResponse.json({ success: true, data: users.slice(0, limit) })
  } catch (err) {
    console.error('[owner users GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
