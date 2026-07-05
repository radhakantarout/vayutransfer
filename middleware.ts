import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'

// Known non-studio subdomains that should NOT be treated as studio sites
const RESERVED_SUBDOMAINS = new Set(['www', 'test', 'api', 'mail', 'smtp'])

// Shared pages that live outside /studio but must still be reachable on the studio app domain
const SHARED_PAGES = new Set(['/privacy', '/terms'])

export async function middleware(request: NextRequest) {
  // x-studio-subdomain is set by the Cloudflare Worker that proxies *.vayustudios.com
  // (x-forwarded-host is avoided because Vercel overwrites it with its own value)
  const host = request.headers.get('x-studio-subdomain') || request.headers.get('host') || ''
  const path = request.nextUrl.pathname

  // ── Domain detection ─────────────────────────────────────────────────────

  // Known full VayuStudios marketing/app domains
  const isStudioAppDomain =
    host === 'vayustudios.com'          ||
    host === 'www.vayustudios.com'      ||
    host === 'test.vayustudios.com'     ||
    host === 'www.test.vayustudios.com'

  // Studio custom subdomain: <slug>.vayustudios.com or <slug>.test.vayustudios.com
  // rkrstudio.test.vayustudios.com → slug = 'rkrstudio' (strip .test.vayustudios.com)
  // rkrstudio.vayustudios.com      → slug = 'rkrstudio' (strip .vayustudios.com)
  let studioSubdomainMatch: string | null = null
  if (host.endsWith('.test.vayustudios.com')) {
    studioSubdomainMatch = host.replace('.test.vayustudios.com', '')
  } else if (host.endsWith('.vayustudios.com') && !isStudioAppDomain) {
    studioSubdomainMatch = host.replace('.vayustudios.com', '')
  }

  // Future: custom domain (e.g. www.ramstudio.in)
  // Non-vayustudios + non-vayutransfer hosts are treated as custom studio domains.
  // The /studio/site/[subdomain] page handles the DynamoDB lookup by customDomain.
  const isCustomDomain =
    !isStudioAppDomain &&
    !studioSubdomainMatch &&
    !host.includes('vayutransfer.com') &&
    !host.includes('localhost') &&
    !host.includes('vercel.app')

  // ── Studio subdomain routing (<slug>.vayustudios.com) ────────────────────
  if (studioSubdomainMatch && !RESERVED_SUBDOMAINS.has(studioSubdomainMatch)) {
    // API calls from the studio website (e.g. booking form POST) must reach the actual
    // API routes — don't rewrite them to /studio/site/...
    if (path.startsWith('/studio/api/') || path.startsWith('/api/')) {
      return NextResponse.next()
    }
    // Rewrite page requests to /studio/site/<slug>[/path]
    // e.g. ramstudio.vayustudios.com/contact → /studio/site/ramstudio/contact
    const rewritePath = path === '/'
      ? `/studio/site/${studioSubdomainMatch}`
      : `/studio/site/${studioSubdomainMatch}${path}`
    return NextResponse.rewrite(new URL(rewritePath, request.url))
  }

  // ── Custom domain routing ─────────────────────────────────────────────────
  // Forward the original host as a header so the page can look it up in DynamoDB
  if (isCustomDomain) {
    const rewritePath = path === '/'
      ? '/studio/site/__custom'
      : `/studio/site/__custom${path}`
    const res = NextResponse.rewrite(new URL(rewritePath, request.url))
    res.headers.set('x-studio-custom-domain', host)
    return res
  }

  // ── VayuStudios app domain routing ──────────────────────────────────────
  if (isStudioAppDomain) {
    if (path === '/') {
      return NextResponse.rewrite(new URL('/studio/home', request.url))
    }
    const isAllowed = path.startsWith('/studio') || path.startsWith('/api') || SHARED_PAGES.has(path)
    if (!isAllowed) {
      return NextResponse.redirect(new URL('/studio/home', request.url))
    }
  }

  // ── Studio API auth guards (apply on all domains) ────────────────────────
  if (path.startsWith('/studio/api/owner/')) {
    const auth = await verifyStudioJWT(request)
    if (!auth || auth.role !== 'OWNER') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
  }

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
