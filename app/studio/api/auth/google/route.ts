import { NextRequest, NextResponse } from 'next/server'
import { signOAuthState, getGoogleAuthUrl } from '@/lib/studio/googleAuth'

export async function GET(req: NextRequest) {
  const next = req.nextUrl.searchParams.get('next') ?? undefined
  const state = await signOAuthState(next)
  return NextResponse.redirect(getGoogleAuthUrl(req.nextUrl.origin, state))
}
