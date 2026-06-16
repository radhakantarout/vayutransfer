import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VayuTransfer — Secure File Transfer. Prepaid. No surprises.',
  description:
    'Send large files securely. Pay only for what you use. No login. No subscription. Load credits and go.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-text-primary antialiased">{children}</body>
    </html>
  )
}
