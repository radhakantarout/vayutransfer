'use client'

import { SessionProvider } from 'next-auth/react'
import { WalletProvider } from '@/lib/wallet-context'
import { ThemeProvider } from '@/lib/theme-context'
import { UploadProvider } from '@/lib/upload-context'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <UploadProvider>
        <SessionProvider>
          <WalletProvider>
            {children}
          </WalletProvider>
        </SessionProvider>
      </UploadProvider>
    </ThemeProvider>
  )
}
