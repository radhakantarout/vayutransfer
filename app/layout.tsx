import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { Inter, Sora } from 'next/font/google'
import './globals.css'
import Providers from '@/components/Providers'
import { ConditionalNavbar, ConditionalFooter } from '@/components/ConditionalNavbar'
import ConditionalSidebar from '@/components/ConditionalSidebar'
import UploadWidget from '@/components/UploadWidget'
import ChatWidget from '@/components/ChatWidget'

// Self-hosted via next/font (built at compile time, no CDN/CSP dependency).
// Inter was previously referenced by name only in globals.css with nothing
// actually loading it — this fixes that silent fallback. Sora is a display
// face for the home page's headlines only (applied via --font-display).
const inter = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' })
const sora = Sora({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-display', display: 'swap' })

export const metadata: Metadata = {
  title: 'VayuTransfer — Secure File Transfer. Prepaid. No surprises.',
  description:
    'Send large files securely across the globe. Pay only for what you use. No subscription, no hidden charges. Transfer instantly.',
  metadataBase: new URL('https://vayutransfer.com'),
  openGraph: {
    title: 'VayuTransfer — Secure File Transfer. Prepaid. No surprises.',
    description: 'Send large files securely across the globe. Pay only for what you use. No subscription, no hidden charges.',
    url: 'https://vayutransfer.com',
    siteName: 'VayuTransfer',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VayuTransfer — Secure File Transfer',
    description: 'Send large files securely across the globe. Pay only for what you use.',
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = headers()
  const host = headersList.get('host') ?? ''
  const isStudioDomain = host.includes('vayustudios.com')

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Anti-flash: must mirror lib/theme-context.tsx's per-domain
            key/default exactly, or the first paint will flash the wrong
            theme before React hydrates. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var s=${JSON.stringify(isStudioDomain)};var k=s?'vayustudio-theme':'vayu-theme';var v=localStorage.getItem(k);var dark=s?(v==='dark'):(v!=='light');if(dark)document.documentElement.classList.add('dark')}catch(e){${isStudioDomain ? '' : "document.documentElement.classList.add('dark')"}}` }} />
        {!isStudioDomain && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'VayuTransfer',
              url: 'https://vayutransfer.com',
              description: 'Send large files securely across the globe. Pay only for what you use.',
              potentialAction: {
                '@type': 'SearchAction',
                target: 'https://vayutransfer.com/download/{fileId}',
                'query-input': 'required name=fileId',
              },
            })}}
          />
        )}
      </head>
      <body className={`${inter.variable} ${sora.variable} min-h-screen bg-bg text-text-primary antialiased flex flex-col overflow-x-hidden w-full font-sans`}>
        <Providers isStudioDomain={isStudioDomain}>
          {!isStudioDomain && <ConditionalNavbar />}
          <div className="flex-1 flex">
            {!isStudioDomain && <ConditionalSidebar />}
            <div className="flex-1 min-w-0">{children}</div>
          </div>
          {!isStudioDomain && <ConditionalFooter />}
          {!isStudioDomain && <UploadWidget />}
          {!isStudioDomain && <ChatWidget />}
        </Providers>
      </body>
    </html>
  )
}
