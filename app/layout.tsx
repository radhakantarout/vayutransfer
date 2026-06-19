import type { Metadata } from 'next'
import './globals.css'
import Providers from '@/components/Providers'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import UploadWidget from '@/components/UploadWidget'

export const metadata: Metadata = {
  title: 'VayuTransfer — Secure File Transfer. Prepaid. No surprises.',
  description:
    'Send large files securely across India. Pay only for what you use. Load credits and transfer instantly.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before paint to prevent flash of wrong theme */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('vayu-theme');if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}` }} />
      </head>
      <body className="min-h-screen bg-bg text-text-primary antialiased flex flex-col overflow-x-hidden w-full">
        <Providers>
          <Navbar />
          <div className="flex-1">{children}</div>
          <Footer />
          <UploadWidget />
        </Providers>
      </body>
    </html>
  )
}
