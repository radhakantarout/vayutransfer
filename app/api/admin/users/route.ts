import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminJWT } from '@/lib/adminAuth'
import { scanAll } from '@/lib/aws/dynamodb'
import type { ApiResponse } from '@/types'
import type { User } from '@/lib/users'

const USERS_TABLE = process.env.DYNAMO_USERS_TABLE ?? 'vayu-users'

// Scan + in-memory filter/sort — no email GSI exists on vayu-users today,
// and this is admin-only, off the user-facing hot path. Fine at current
// scale; revisit with a real index if the table gets large.
export async function GET(req: NextRequest) {
  const auth = await verifyAdminJWT(req)
  if (!auth) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  try {
    const q = req.nextUrl.searchParams.get('q')?.trim().toLowerCase()
    let users = await scanAll<User>(USERS_TABLE)
    if (q) {
      users = users.filter((u) => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))
    }
    users.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    return NextResponse.json<ApiResponse<{ users: User[]; total: number }>>({
      success: true,
      data: { users: users.slice(0, 200), total: users.length },
    })
  } catch (err) {
    console.error('[admin/users]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to load users' },
      { status: 500 }
    )
  }
}
