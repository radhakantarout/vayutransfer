import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminJWT } from '@/lib/adminAuth'
import { scanCount, scanAll } from '@/lib/aws/dynamodb'
import { getCachedR2Stats } from '@/lib/platformStats'
import type { ApiResponse, Transaction, Wallet, Transfer } from '@/types'

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
    const [totalUsers, totalTransferred, totalReceived, wallets, topups, r2Stats, activeR2Transfers] = await Promise.all([
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
      // Live "expected" total — what R2 SHOULD contain if every still-live
      // R2-backed transfer's real object exists and nothing orphaned is
      // sitting there. Shown next to the cached bucket-scan total so a gap
      // between the two is immediately visible instead of silently trusted.
      //
      // Filters to expiryTime > now, not just status === 'active' — a
      // Transfer's status is set to 'active' once and never updated again
      // (there's no code path anywhere that ever writes 'expired'; real
      // access control checks expiryTime directly at download time, see
      // app/api/download/[fileId]/route.ts). Without this filter, every
      // transfer past its retention window — whose real R2 object was
      // already correctly removed by the bucket's own 20-day lifecycle
      // rule — still counted as "expected," making this number too high
      // and producing an impossible negative "Unaccounted" gap.
      scanAll<Transfer>(
        TRANSFERS_TABLE,
        '#s = :active AND storageBackend = :r2 AND expiryTime > :now',
        { ':active': 'active', ':r2': 'R2', ':now': new Date().toISOString() },
        { '#s': 'status' }
      ),
    ])

    const totalWalletBalancePaise = wallets.reduce((sum, w) => sum + (w.balance ?? 0), 0)
    const totalRevenuePaise = topups.reduce((sum, t) => sum + (t.amount ?? 0), 0)
    const expectedActiveBytes = activeR2Transfers.reduce((sum, t) => sum + (t.fileSizeBytes ?? 0), 0)

    return NextResponse.json<ApiResponse<{
      totalUsers: number
      totalItemsTransferred: number
      totalItemsReceived: number
      totalWalletBalancePaise: number
      totalRevenuePaise: number
      storage: { totalObjects: number; totalBytes: number; lastSyncedAt: string } | null
      expectedActiveBytes: number
    }>>({
      success: true,
      data: {
        totalUsers,
        totalItemsTransferred: totalTransferred,
        totalItemsReceived: totalReceived,
        totalWalletBalancePaise,
        totalRevenuePaise,
        storage: r2Stats ? { totalObjects: r2Stats.totalObjects, totalBytes: r2Stats.totalBytes, lastSyncedAt: r2Stats.lastSyncedAt } : null,
        expectedActiveBytes,
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
