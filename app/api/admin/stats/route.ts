import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminJWT } from '@/lib/adminAuth'
import { scanCount, scanAll } from '@/lib/aws/dynamodb'
import { getCachedR2Stats } from '@/lib/platformStats'
import type { ApiResponse, Transaction, Wallet } from '@/types'

const USERS_TABLE = process.env.DYNAMO_USERS_TABLE ?? 'vayu-users'
const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
const DOWNLOADS_TABLE = process.env.DYNAMO_DOWNLOADS_TABLE ?? 'vayu-downloads'
const WALLETS_TABLE = process.env.DYNAMO_WALLETS_TABLE ?? 'vayu-wallets'
const TRANSACTIONS_TABLE = process.env.DYNAMO_TRANSACTIONS_TABLE ?? 'vayu-transactions'

// Full-table scans — see lib/aws/dynamodb.ts's "Admin-only helpers" note.
// Storage is read from the cached vayu-platform-stats row (synced by
// POST /api/admin/r2-sync's "Sync Now"), not scanned live here.
export async function GET(req: NextRequest) {
  const auth = await verifyAdminJWT(req)
  if (!auth) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  try {
    const [totalUsers, totalTransferred, totalReceived, wallets, topups, r2Stats] = await Promise.all([
      scanCount(USERS_TABLE),
      scanCount(TRANSFERS_TABLE),
      scanCount(DOWNLOADS_TABLE, 'outcome = :s', { ':s': 'success' }),
      scanAll<Wallet>(WALLETS_TABLE),
      // 'type' and 'status' are both reserved DynamoDB words — must alias.
      scanAll<Transaction>(
        TRANSACTIONS_TABLE,
        '#t = :topup AND #s = :success',
        { ':topup': 'topup', ':success': 'success' },
        { '#t': 'type', '#s': 'status' }
      ),
      getCachedR2Stats(),
    ])

    const totalWalletBalancePaise = wallets.reduce((sum, w) => sum + (w.balance ?? 0), 0)
    const totalRevenuePaise = topups.reduce((sum, t) => sum + (t.amount ?? 0), 0)

    return NextResponse.json<ApiResponse<{
      totalUsers: number
      totalItemsTransferred: number
      totalItemsReceived: number
      totalWalletBalancePaise: number
      totalRevenuePaise: number
      storage: { totalObjects: number; totalBytes: number; lastSyncedAt: string } | null
    }>>({
      success: true,
      data: {
        totalUsers,
        totalItemsTransferred: totalTransferred,
        totalItemsReceived: totalReceived,
        totalWalletBalancePaise,
        totalRevenuePaise,
        storage: r2Stats ? { totalObjects: r2Stats.totalObjects, totalBytes: r2Stats.totalBytes, lastSyncedAt: r2Stats.lastSyncedAt } : null,
      },
    })
  } catch (err) {
    console.error('[admin/stats]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to load stats' },
      { status: 500 }
    )
  }
}
