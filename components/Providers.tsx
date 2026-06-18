'use client'

import { SessionProvider } from 'next-auth/react'
import { WalletProvider } from '@/lib/wallet-context'
import { ThemeProvider } from '@/lib/theme-context'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SessionProvider>
        <WalletProvider>
          {children}
        </WalletProvider>
      </SessionProvider>
    </ThemeProvider>
  )
}
