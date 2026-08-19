import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminJWT } from '@/lib/adminAuth'
import { getItem, queryItems } from '@/lib/aws/dynamodb'
import type { ApiResponse, Wallet, Transaction, Transfer, AuditEvent } from '@/types'
import type { User } from '@/lib/users'

const USERS_TABLE = process.env.DYNAMO_USERS_TABLE ?? 'vayu-users'
const WALLETS_TABLE = process.env.DYNAMO_WALLETS_TABLE ?? 'vayu-wallets'
const TRANSACTIONS_TABLE = process.env.DYNAMO_TRANSACTIONS_TABLE ?? 'vayu-transactions'
const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
const AUDIT_TABLE = process.env.DYNAMO_AUDIT_TABLE ?? 'vayu-audit'

// Full profile drill-down for "monitor user wallet transactions if user
// claims" / "file delete operations" — every piece here is real data
// through existing GSIs (walletId-index on transactions/transfers/audit,
// all already provisioned per CLAUDE.md), just newly surfaced together.
export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const auth = await verifyAdminJWT(req)
  if (!auth) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  try {
    const { userId } = params
    const user = await getItem<User>(USERS_TABLE, { userId })
    if (!user) {
      return NextResponse.json<ApiResponse<never>>({ success: false, error: 'NOT_FOUND', message: 'User not found' }, { status: 404 })
    }

    const [wallet, transactions, transfers, auditEvents] = await Promise.all([
      getItem<Wallet>(WALLETS_TABLE, { walletId: user.walletId }),
      queryItems<Transaction>(TRANSACTIONS_TABLE, 'walletId-index', 'walletId = :w', { ':w': user.walletId }),
      queryItems<Transfer>(TRANSFERS_TABLE, 'walletId-index', 'walletId = :w', { ':w': user.walletId }),
      queryItems<AuditEvent>(AUDIT_TABLE, 'walletId-index', 'walletId = :w', { ':w': user.walletId }),
    ])

    transactions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    transfers.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    auditEvents.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    return NextResponse.json<ApiResponse<{
      user: User
      wallet: Wallet | null
      transactions: Transaction[]
      transfers: Transfer[]
      auditEvents: AuditEvent[]
    }>>({
      success: true,
      data: {
        user,
        wallet,
        transactions: transactions.slice(0, 100),
        transfers: transfers.slice(0, 100),
        auditEvents: auditEvents.slice(0, 100),
      },
    })
  } catch (err) {
    console.error('[admin/users/:userId]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to load user' },
      { status: 500 }
    )
  }
}
