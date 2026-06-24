import type { Metadata } from 'next'
import './globals.css'
import Providers from '@/components/Providers'
import { ConditionalNavbar, ConditionalFooter } from '@/components/ConditionalNavbar'
import UploadWidget from '@/components/UploadWidget'

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('vayu-theme');if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}` }} />
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
      </head>
      <body className="min-h-screen bg-bg text-text-primary antialiased flex flex-col overflow-x-hidden w-full">
        <Providers>
          <ConditionalNavbar />
          <div className="flex-1">{children}</div>
          <ConditionalFooter />
          <UploadWidget />
        </Providers>
      </body>
    </html>
  )
}
