import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getServerSession } from 'next-auth/next'
import { v4 as uuidv4 } from 'uuid'
import { getOrCreateWallet } from '@/lib/wallet'
import { getUserById } from '@/lib/users'
import { getItem } from '@/lib/aws/dynamodb'
import { authOptions } from '@/lib/auth'
import { formatPaise } from '@/lib/pricing'
import type { ApiResponse, Wallet } from '@/types'

const WALLETS_TABLE = process.env.DYNAMO_WALLETS_TABLE ?? 'vayu-wallets'

interface BalanceResponse {
  walletId: string
  balancePaise: number
  balanceFormatted: string
}

function toBalanceResponse(wallet: Wallet): BalanceResponse {
  return {
    walletId: wallet.walletId,
    balancePaise: wallet.balance,
    balanceFormatted: formatPaise(wallet.balance),
  }
}

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    // Signed-in user: look up their wallet via vayu-users
    if (session?.user?.id) {
      const user = await getUserById(session.user.id)
      if (user) {
        const wallet = await getItem<Wallet>(WALLETS_TABLE, { walletId: user.walletId })
        if (wallet) {
          return NextResponse.json<ApiResponse<BalanceResponse>>({
            success: true,
            data: toBalanceResponse(wallet),
          })
        }
      }
      // User record missing — create wallet tied to their Google userId
      const wallet = await getOrCreateWallet(session.user.id)
      return NextResponse.json<ApiResponse<BalanceResponse>>({
        success: true,
        data: toBalanceResponse(wallet),
      })
    }

    // Anonymous user: cookie-based session
    const cookieStore = cookies()
    let sessionId = cookieStore.get('vayu_session')?.value
    const isNewSession = !sessionId
    if (isNewSession) sessionId = uuidv4()

    const wallet = await getOrCreateWallet(sessionId!)

    const response = NextResponse.json<ApiResponse<BalanceResponse>>({
      success: true,
      data: toBalanceResponse(wallet),
    })

    if (isNewSession) {
      response.cookies.set('vayu_session', sessionId!, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
      })
    }

    return response
  } catch (err) {
    console.error('[wallet/balance]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to fetch wallet balance' },
      { status: 500 }
    )
  }
}
