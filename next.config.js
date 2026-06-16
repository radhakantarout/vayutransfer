/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [process.env.CLOUDFRONT_DOMAIN?.replace('https://', '') ?? ''],
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
    ]
  },
  experimental: {
    serverComponentsExternalPackages: ['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb'],
  },
}

module.exports = nextConfig
