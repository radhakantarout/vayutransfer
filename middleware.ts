import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const path = request.nextUrl.pathname

  // ── Domain detection ─────────────────────────────────────────────────────
  // VayuStudios domains (production + test, www variants included)
  const isStudioDomain =
    host === 'vayustudios.com'          ||
    host === 'www.vayustudios.com'      ||
    host === 'test.vayustudios.com'     ||
    host === 'www.test.vayustudios.com'

  // ── VayuStudios domain routing ───────────────────────────────────────────
  if (isStudioDomain) {
    // Root → studio home page
    if (path === '/') {
      return NextResponse.rewrite(new URL('/studio/home', request.url))
    }
    // Any non-studio, non-API path → redirect to studio home
    // (blocks VayuTransfer pages: /wallet, /transfers, /login, /pricing etc.)
    const isAllowed = path.startsWith('/studio') || path.startsWith('/api')
    if (!isAllowed) {
      return NextResponse.redirect(new URL('/studio/home', request.url))
    }
  }

  // ── Studio API auth guards (apply on all domains) ────────────────────────
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
