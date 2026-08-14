import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { buildDriveAuthUrl, generateOAuthState, DRIVE_OAUTH_STATE_COOKIE } from '@/lib/googleDrive/oauth'

// Starts the Drive-only OAuth consent step — separate from NextAuth login
// (lib/auth.ts is untouched). Requires an existing VayuTransfer sign-in;
// Drive import always rides on the same Google identity as login, it just
// asks for one additional, minimal scope in its own consent screen.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED', message: 'Sign in first' }, { status: 401 })
  }

  const state = generateOAuthState()
  const res = NextResponse.redirect(buildDriveAuthUrl(state))
  res.cookies.set(DRIVE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes — plenty for a consent redirect round trip
    path: '/',
  })
  return res
}
