import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminJWT } from '@/lib/adminAuth'
import { scanAll } from '@/lib/aws/dynamodb'
import type { ApiResponse, Transfer } from '@/types'
import type { User } from '@/lib/users'

const USERS_TABLE = process.env.DYNAMO_USERS_TABLE ?? 'vayu-users'
const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'

export interface AdminUserRow extends User {
  // "Usage" = bytes currently actually stored (status active) — what a
  // "Clear Memory" action would actually reclaim. totalTransfers counts
  // every non-deleted transfer regardless of status, for a general
  // activity signal alongside the storage number.
  totalUsageBytes: number
  totalTransfers: number
}

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
    const [rawUsers, transfers] = await Promise.all([
      scanAll<User>(USERS_TABLE),
      scanAll<Transfer>(TRANSFERS_TABLE),
    ])

    const usageByWallet = new Map<string, { totalUsageBytes: number; totalTransfers: number }>()
    for (const t of transfers) {
      if (t.status === 'deleted') continue
      const entry = usageByWallet.get(t.walletId) ?? { totalUsageBytes: 0, totalTransfers: 0 }
      entry.totalTransfers += 1
      if (t.status === 'active') entry.totalUsageBytes += t.fileSizeBytes
      usageByWallet.set(t.walletId, entry)
    }

    let users: AdminUserRow[] = rawUsers.map((u) => ({
      ...u,
      totalUsageBytes: usageByWallet.get(u.walletId)?.totalUsageBytes ?? 0,
      totalTransfers: usageByWallet.get(u.walletId)?.totalTransfers ?? 0,
    }))
    if (q) {
      users = users.filter((u) => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))
    }
    users.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    return NextResponse.json<ApiResponse<{ users: AdminUserRow[]; total: number }>>({
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
