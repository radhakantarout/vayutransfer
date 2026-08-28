/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'previews.vayustudios.com' },
      ...(process.env.CLOUDFRONT_DOMAIN
        ? [{ protocol: 'https', hostname: process.env.CLOUDFRONT_DOMAIN.replace('https://', '') }]
        : []),
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
      {
        // Public studio websites need to be embeddable in the VayuStudios
        // dashboard's own live-preview panel (WebsiteManager.tsx /
        // LivePreviewPanel.tsx) via an iframe — the blanket DENY above blocks
        // that, including same-origin. CSP's frame-ancestors takes precedence
        // over X-Frame-Options in every modern browser when both are present,
        // so this scoped allowlist only loosens framing for this one public,
        // unauthenticated route — everything else (wallet, admin, login, the
        // rest of VayuTransfer) keeps the blanket DENY untouched.
        source: '/studio/site/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://vayustudios.com https://*.vayustudios.com https://test.vayustudios.com https://*.test.vayustudios.com",
          },
        ],
      },
    ]
  },
  experimental: {
    serverComponentsExternalPackages: ['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb'],
  },
}

module.exports = nextConfig
