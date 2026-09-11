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

  // ── VayuStudios Moments: individual-user sign-in ─────────────────────────
  // Kept fully separate from the ADMIN branch below — a Moments session can
  // never be issued the ADMIN role, even if this same email also runs a real
  // studio (that row is looked up by role, never assumed from array order).
  if (statePayload.intent === 'moments') {
    // Carried through to the register page (new signups) and honored on the
    // way back for existing users too — this is what lets "sign in to join
    // this gallery" actually land back on the invite page instead of always
    // dumping the visitor on the generic /studio/moments landing.
    const momentsNext = statePayload.next?.startsWith('/studio/moments/') ? statePayload.next : null
    const nextSuffix = momentsNext ? `&next=${encodeURIComponent(momentsNext)}` : ''

    const clientUser = users.find((u) => u.role === 'CLIENT')

    if (!clientUser) {
      const signupToken = await signGoogleSignupToken(email, name)
      return NextResponse.redirect(new URL(`/studio/moments/register?token=${encodeURIComponent(signupToken)}${nextSuffix}`, req.url))
    }
    if (clientUser.status === 'SUSPENDED') return NextResponse.redirect(loginUrl('SUSPENDED'))

    // A CLIENT identity that exists only from a photographer's gallery link
    // (never signed up for Moments) has no personal Studio yet — send them
    // through onboarding once to create it, same as a brand-new signup.
    if (!clientUser.personalStudioId) {
      const signupToken = await signGoogleSignupToken(email, name)
      return NextResponse.redirect(new URL(`/studio/moments/register?token=${encodeURIComponent(signupToken)}${nextSuffix}`, req.url))
    }

    await studioUpdateItem(TABLES.users, { userId: clientUser.userId }, 'SET lastLoginAt = :now', { ':now': new Date().toISOString() })

    const token = await signStudioJWT({ userId: clientUser.userId, role: 'CLIENT', studioId: clientUser.personalStudioId })
    const response = NextResponse.redirect(new URL(momentsNext ?? '/studio/moments', req.url))
    setSessionCookies(response, token, { role: 'CLIENT', name: clientUser.name, email: clientUser.email })
    return response
  }

  // ── Studio Admin sign-in (default/original flow) ─────────────────────────
  const user = users.find((u) => u.role === 'ADMIN')

  // No existing admin account — first-time Google sign-in, hand off to instant self-serve setup
  if (!user) {
    const signupToken = await signGoogleSignupToken(email, name)
    return NextResponse.redirect(new URL(`/studio/register?token=${encodeURIComponent(signupToken)}`, req.url))
  }

  if (user.status === 'SUSPENDED') return NextResponse.redirect(loginUrl('SUSPENDED'))

  await studioUpdateItem(TABLES.users, { userId: user.userId }, 'SET lastLoginAt = :now', { ':now': new Date().toISOString() })

  const token = await signStudioJWT({ userId: user.userId, role: 'ADMIN', studioId: user.linkedStudioId })
  const next = statePayload.next
  const redirectTo = next?.startsWith('/studio/') ? next : '/studio/dashboard'
  const response = NextResponse.redirect(new URL(redirectTo, req.url))
  setSessionCookies(response, token, { role: 'ADMIN', name: user.name, email: user.email })
  return response
}
