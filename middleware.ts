import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const path = request.nextUrl.pathname

  const isStudioSubdomain =
    host === 'studio.vayutransfer.com' ||
    host === 'www.studio.vayutransfer.com' ||
    host === 'studio.localhost:3000'

  // Subdomain routing — studio.vayutransfer.com/* → /studio/*
  if (isStudioSubdomain && !path.startsWith('/studio')) {
    const target = path === '/' ? '/studio/home' : `/studio${path}`
    return NextResponse.rewrite(new URL(target, request.url))
  }

  // Platform Owner routes — OWNER role only
  if (path.startsWith('/studio/api/owner/')) {
    const auth = await verifyStudioJWT(request)
    if (!auth || auth.role !== 'OWNER') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
  }

  // Studio Admin routes — ADMIN or OWNER
  if (path.startsWith('/studio/api/admin/')) {
    const auth = await verifyStudioJWT(request)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
