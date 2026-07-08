import { NextRequest, NextResponse } from 'next/server'
import {
  verifyOAuthState,
  exchangeCodeForIdToken,
  verifyGoogleIdToken,
  signGoogleSignupToken,
} from '@/lib/studio/googleAuth'
import { signStudioJWT } from '@/lib/studio/auth'
import { studioQueryByIndex, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioUser } from '@/types/studio'

function setSessionCookies(response: NextResponse, token: string, user: { role: string; name?: string; email?: string }) {
  response.cookies.set('studio_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: '/',
  })
  response.cookies.set('studio_ui', JSON.stringify({ role: user.role, name: user.name ?? '', email: user.email ?? '' }), {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: '/',
  })
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const loginUrl = (error?: string) => new URL(`/studio/login${error ? `?error=${error}` : ''}`, req.url)

  const code  = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  if (!code || !state) return NextResponse.redirect(loginUrl('OAUTH_FAILED'))

  const statePayload = await verifyOAuthState(state)
  if (!statePayload) return NextResponse.redirect(loginUrl('OAUTH_FAILED'))

  let email: string, name: string
  try {
    const idToken = await exchangeCodeForIdToken(code, origin)
    const verified = await verifyGoogleIdToken(idToken)
    email = verified.email
    name  = verified.name
  } catch (err) {
    console.error('[google callback] token exchange/verify failed', err)
    return NextResponse.redirect(loginUrl('OAUTH_FAILED'))
  }

  const users = await studioQueryByIndex<StudioUser>(TABLES.users, 'email-index', 'email = :e', { ':e': email })
  const user = users[0]

  // No existing account — first-time Google sign-in, hand off to instant self-serve setup
  if (!user) {
    const signupToken = await signGoogleSignupToken(email, name)
    return NextResponse.redirect(new URL(`/studio/register?token=${encodeURIComponent(signupToken)}`, req.url))
  }

  if (user.role !== 'ADMIN') return NextResponse.redirect(loginUrl('INVALID_ACCOUNT'))
  if (user.status === 'SUSPENDED') return NextResponse.redirect(loginUrl('SUSPENDED'))

  await studioUpdateItem(TABLES.users, { userId: user.userId }, 'SET lastLoginAt = :now', { ':now': new Date().toISOString() })

  const token = await signStudioJWT({ userId: user.userId, role: 'ADMIN', studioId: user.linkedStudioId })
  const next = statePayload.next
  const redirectTo = next?.startsWith('/studio/') ? next : '/studio/dashboard'
  const response = NextResponse.redirect(new URL(redirectTo, req.url))
  setSessionCookies(response, token, { role: 'ADMIN', name: user.name, email: user.email })
  return response
}
