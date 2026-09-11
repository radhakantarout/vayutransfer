import { NextRequest, NextResponse } from 'next/server'
import { signOAuthState, getGoogleAuthUrl, type GoogleAuthIntent } from '@/lib/studio/googleAuth'

export async function GET(req: NextRequest) {
  const next = req.nextUrl.searchParams.get('next') ?? undefined
  const intent: GoogleAuthIntent = req.nextUrl.searchParams.get('intent') === 'moments' ? 'moments' : 'admin'
  const state = await signOAuthState(next, intent)
  return NextResponse.redirect(getGoogleAuthUrl(req.nextUrl.origin, state))
}
