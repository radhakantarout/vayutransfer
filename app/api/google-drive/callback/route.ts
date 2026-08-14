import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { exchangeDriveCode, DRIVE_OAUTH_STATE_COOKIE } from '@/lib/googleDrive/oauth'
import { saveDriveToken } from '@/lib/googleDrive/tokens'
import { logAudit } from '@/lib/audit'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

function redirectWithFlag(flag: 'drive_connected' | 'drive_error'): NextResponse {
  const res = NextResponse.redirect(`${APP_URL}/?${flag}=1`)
  res.cookies.delete(DRIVE_OAUTH_STATE_COOKIE)
  return res
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return redirectWithFlag('drive_error')
  }

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const oauthError = searchParams.get('error')
  const expectedState = req.cookies.get(DRIVE_OAUTH_STATE_COOKIE)?.value

  // User cancelled at Google's consent screen — not an error, just decline.
  if (oauthError) {
    return redirectWithFlag('drive_error')
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    void logAudit({ eventType: 'DRIVE_IMPORT_FAILED', actor: 'user', outcome: 'failure', errorCode: 'OAUTH_STATE_MISMATCH' })
    return redirectWithFlag('drive_error')
  }

  try {
    const { refreshToken, scope } = await exchangeDriveCode(code)
    await saveDriveToken(session.user.id, refreshToken, scope)
    void logAudit({ eventType: 'DRIVE_CONNECTED', actor: 'user', outcome: 'success', metadata: { userId: session.user.id } })
    return redirectWithFlag('drive_connected')
  } catch (err) {
    console.error('[google-drive/callback]', err)
    void logAudit({ eventType: 'DRIVE_IMPORT_FAILED', actor: 'user', outcome: 'failure', errorCode: 'TOKEN_EXCHANGE_FAILED' })
    return redirectWithFlag('drive_error')
  }
}
