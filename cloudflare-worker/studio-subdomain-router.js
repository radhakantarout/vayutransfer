/**
 * Cloudflare Worker: Studio Subdomain Router
 *
 * Routes:
 *   *.vayustudios.com/*      → https://vayustudios.com      (production)
 *   *.test.vayustudios.com/* → https://test.vayustudios.com (test/preview)
 *
 * Passes the original host as x-studio-subdomain so Next.js middleware
 * can detect the studio slug without Vercel overwriting x-forwarded-host.
 */

export default {
  async fetch(request) {
    const originalUrl  = new URL(request.url)
    const originalHost = request.headers.get('host') // e.g. rkrstudio.vayustudios.com

    // Route test subdomains (*.test.vayustudios.com) to preview deployment
    const isTest     = originalHost.endsWith('.test.vayustudios.com')
    const vercelHost = isTest ? 'test.vayustudios.com' : 'vayustudios.com'
    const vercelUrl  = isTest ? 'https://test.vayustudios.com' : 'https://vayustudios.com'

    // Build target URL: same path + query on the correct Vercel deployment
    const targetUrl = new URL(originalUrl.pathname + originalUrl.search, vercelUrl)

    // Copy all incoming headers, override Host so Vercel routes correctly,
    // and add x-studio-subdomain so Next.js middleware sees the original subdomain.
    const headers = new Headers(request.headers)
    headers.set('host', vercelHost)
    headers.set('x-studio-subdomain', originalHost)

    const response = await fetch(targetUrl.toString(), {
      method:  request.method,
      headers,
      body:    request.body,
      redirect: 'manual', // let the browser handle redirects
    })

    return response
  },
}
