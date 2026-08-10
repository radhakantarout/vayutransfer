import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getUserById } from '@/lib/users'
import { getItem, queryItems } from '@/lib/aws/dynamodb'
import type { ApiResponse, Transfer, Download } from '@/types'

const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
const DOWNLOADS_TABLE = process.env.DYNAMO_DOWNLOADS_TABLE ?? 'vayu-downloads'

// Lets a transfer owner see who's actually hit their shared link — every
// download attempt (success, expired, exhausted, invalid), not just the
// running counter already shown on /transfers. No raw IP is ever exposed,
// only the ipHash/countryCode already collected at download time.
export async function GET(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'UNAUTHORIZED', message: 'Sign in to view activity' },
        { status: 401 }
      )
    }
    const user = await getUserById(session.user.id)
    const { fileId } = params
    const transfer = await getItem<Transfer>(TRANSFERS_TABLE, { fileId })
    if (!transfer || !user || transfer.walletId !== user.walletId) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'FORBIDDEN', message: 'This transfer does not belong to you' },
        { status: 403 }
      )
    }

    const attempts = await queryItems<Download>(
      DOWNLOADS_TABLE, 'fileId-index', 'fileId = :f', { ':f': fileId }
    )
    const sorted = attempts.sort((a, b) => b.attemptedAt.localeCompare(a.attemptedAt))

    return NextResponse.json<ApiResponse<{
      attempts: { downloadId: string; attemptedAt: string; outcome: string; countryCode?: string }[]
    }>>({
      success: true,
      data: {
        attempts: sorted.map((d) => ({
          downloadId: d.downloadId,
          attemptedAt: d.attemptedAt,
          outcome: d.outcome,
          countryCode: d.countryCode,
        })),
      },
    })
  } catch (err) {
    console.error('[transfer activity GET]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to load activity' },
      { status: 500 }
    )
  }
}
