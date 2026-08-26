import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminJWT } from '@/lib/adminAuth'
import { scanAll } from '@/lib/aws/dynamodb'
import { getCachedR2UsageByWallet } from '@/lib/platformStats'
import type { ApiResponse, Transfer } from '@/types'
import type { User } from '@/lib/users'

const USERS_TABLE = process.env.DYNAMO_USERS_TABLE ?? 'vayu-users'
const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'

export interface AdminUserRow extends User {
  // "Active Usage" — bytes DynamoDB says are currently active, computed
  // live on every load. totalTransfers counts every non-deleted transfer
  // regardless of status, for a general activity signal.
  totalUsageBytes: number
  totalTransfers: number
  // "R2 Usage" — real bytes this wallet owns in the actual bucket, from
  // the cached orphan-detection scan (lib/r2Orphans.ts, refreshed by
  // Overview's "Sync Now"). null means no sync has ever run yet — distinct
  // from 0, which means synced and genuinely empty. A gap between this and
  // totalUsageBytes for one user is the same signal as the Overview page's
  // aggregate "Unaccounted" number, just scoped to them.
  r2UsageBytes: number | null
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
    const [rawUsers, transfers, cachedR2Usage] = await Promise.all([
      scanAll<User>(USERS_TABLE),
      scanAll<Transfer>(TRANSFERS_TABLE),
      getCachedR2UsageByWallet(),
    ])

    // status stays 'active' forever once set — nothing ever writes
    // 'expired' (real access control checks expiryTime directly at
    // download time). Also requiring expiryTime > now here so a transfer
    // whose real R2 object already aged out via the bucket's 20-day
    // lifecycle rule doesn't keep counting as "active usage" forever.
    const now = new Date().toISOString()
    const usageByWallet = new Map<string, { totalUsageBytes: number; totalTransfers: number }>()
    for (const t of transfers) {
      if (t.status === 'deleted') continue
      const entry = usageByWallet.get(t.walletId) ?? { totalUsageBytes: 0, totalTransfers: 0 }
      entry.totalTransfers += 1
      if (t.status === 'active' && t.expiryTime > now) entry.totalUsageBytes += t.fileSizeBytes
      usageByWallet.set(t.walletId, entry)
    }

    let users: AdminUserRow[] = rawUsers.map((u) => ({
      ...u,
      totalUsageBytes: usageByWallet.get(u.walletId)?.totalUsageBytes ?? 0,
      totalTransfers: usageByWallet.get(u.walletId)?.totalTransfers ?? 0,
      r2UsageBytes: cachedR2Usage ? (cachedR2Usage.usageByWallet[u.walletId] ?? 0) : null,
    }))
    if (q) {
      users = users.filter((u) => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))
    }
    users.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    return NextResponse.json<ApiResponse<{ users: AdminUserRow[]; total: number; r2SyncedAt: string | null }>>({
      success: true,
      data: { users: users.slice(0, 200), total: users.length, r2SyncedAt: cachedR2Usage?.lastSyncedAt ?? null },
    })
  } catch (err) {
    console.error('[admin/users]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to load users' },
      { status: 500 }
    )
  }
}
