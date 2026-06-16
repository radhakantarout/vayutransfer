import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { v4 as uuidv4 } from 'uuid'
import { getOrCreateWallet } from '@/lib/wallet'
import { formatPaise } from '@/lib/pricing'
import type { ApiResponse } from '@/types'

export async function GET(_req: NextRequest) {
  try {
    const cookieStore = cookies()
    let sessionId = cookieStore.get('vayu_session')?.value

    const isNewSession = !sessionId
    if (isNewSession) {
      sessionId = uuidv4()
    }

    const wallet = await getOrCreateWallet(sessionId!)

    const response = NextResponse.json<ApiResponse<{
      walletId: string
      balancePaise: number
      balanceFormatted: string
    }>>({
      success: true,
      data: {
        walletId: wallet.walletId,
        balancePaise: wallet.balance,
        balanceFormatted: formatPaise(wallet.balance),
      },
    })

    if (isNewSession) {
      response.cookies.set('vayu_session', sessionId!, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365, // 1 year
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
