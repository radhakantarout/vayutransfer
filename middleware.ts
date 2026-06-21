import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const path = request.nextUrl.pathname

  // Subdomain routing — studio.vayutransfer.com → /studio/*
  if (
    (host === 'studio.vayutransfer.com' || host === 'studio.localhost:3000') &&
    !path.startsWith('/studio')
  ) {
    return NextResponse.rewrite(new URL(`/studio${path}`, request.url))
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
  matcher: ['/studio/:path*'],
}
