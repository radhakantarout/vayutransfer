import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { verifyAdminJWT } from '@/lib/adminAuth'

// Known non-studio subdomains that should NOT be treated as studio sites
const RESERVED_SUBDOMAINS = new Set(['www', 'test', 'api', 'mail', 'smtp'])

// Shared pages that live outside /studio but must still be reachable on the studio app domain
const SHARED_PAGES = new Set(['/privacy', '/terms', '/robots.txt', '/sitemap.xml'])

// Lets the VayuStudios dashboard's own live-preview panel (WebsiteManager.tsx /
// LivePreviewPanel.tsx) embed a studio's public site in an iframe. CSP's
// frame-ancestors takes precedence over X-Frame-Options in every modern
// browser when both are present, so this overrides next.config.js's blanket
// X-Frame-Options: DENY for exactly these rewritten responses.
//
// next.config.js also has a headers() rule for this same purpose scoped to
// /studio/site/:path* — that only ever matches *direct* path access (e.g.
// test.vayustudios.com/studio/site/rkr, or localhost), because next.config's
// header source matching runs against the pre-rewrite request path. A real
// production subdomain request (rkr.vayustudios.com/) arrives with path `/`
// and only becomes /studio/site/rkr via the rewrite() calls below, so it
// needs the header set here, at the point of the actual rewrite.
const STUDIO_SITE_FRAME_CSP =
  "frame-ancestors 'self' https://vayustudios.com https://*.vayustudios.com https://test.vayustudios.com https://*.test.vayustudios.com"

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
    // `new URL(path, base)` drops base's query string when `path` is an
    // absolute path with no `?` of its own — without re-attaching it here,
    // ?previewToken=/&v= (the dashboard live-preview iframe's params) never
    // reach page.tsx on a real production subdomain, silently disabling the
    // instant-postMessage preview channel (falls back to only updating on
    // Save, since that forces a full iframe reload that re-fetches from DB).
    const rewriteUrl = new URL(rewritePath, request.url)
    rewriteUrl.search = request.nextUrl.search
    const res = NextResponse.rewrite(rewriteUrl)
    res.headers.set('Content-Security-Policy', STUDIO_SITE_FRAME_CSP)
    return res
  }

  // ── Custom domain routing ─────────────────────────────────────────────────
  // Forward the original host as a header so the page can look it up in DynamoDB
  if (isCustomDomain) {
    const rewritePath = path === '/'
      ? '/studio/site/__custom'
      : `/studio/site/__custom${path}`
    const rewriteUrl = new URL(rewritePath, request.url)
    rewriteUrl.search = request.nextUrl.search
    const res = NextResponse.rewrite(rewriteUrl)
    res.headers.set('x-studio-custom-domain', host)
    res.headers.set('Content-Security-Policy', STUDIO_SITE_FRAME_CSP)
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

  // ── VayuTransfer platform-admin API auth guard ───────────────────────────
  // Own JWT/cookie, fully separate from the studio guards above — see
  // lib/adminAuth.ts. /api/admin/auth/* (login/logout/me) stays open since
  // login itself can't require the cookie it's about to issue.
  if (path.startsWith('/api/admin/') && !path.startsWith('/api/admin/auth/')) {
    const auth = await verifyAdminJWT(request)
    if (!auth) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
