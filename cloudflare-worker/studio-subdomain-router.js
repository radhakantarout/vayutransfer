/**
 * Cloudflare Worker: Studio Subdomain Router
 *
 * Route:  *.vayustudios.com/*
 * Effect: Proxies rkrstudio.vayustudios.com → vayustudios.com
 *         and passes the original host as x-forwarded-host so
 *         Next.js middleware can detect the studio slug.
 *
 * Deploy steps (in Cloudflare dashboard):
 *   1. Workers & Pages → Create Application → Create Worker
 *   2. Paste this code → Deploy
 *   3. Settings → Triggers → Add Route:
 *        Route:   *.vayustudios.com/*
 *        Zone:    vayustudios.com
 */

const VERCEL_TARGET = 'https://vayustudios.com'

export default {
  async fetch(request) {
    const originalUrl  = new URL(request.url)
    const originalHost = request.headers.get('host') // e.g. rkrstudio.vayustudios.com

    // Build target URL: same path + query, but on vayustudios.com
    const targetUrl = new URL(originalUrl.pathname + originalUrl.search, VERCEL_TARGET)

    // Copy all incoming headers, override Host so Vercel routes correctly,
    // and add x-forwarded-host so Next.js middleware sees the original subdomain.
    const headers = new Headers(request.headers)
    headers.set('host', 'vayustudios.com')
    headers.set('x-forwarded-host', originalHost)

    const response = await fetch(targetUrl.toString(), {
      method:  request.method,
      headers,
      body:    request.body,
      redirect: 'manual', // let the browser handle redirects
    })

    return response
  },
}
