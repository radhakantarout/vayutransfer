'use client'

import { SessionProvider } from 'next-auth/react'
import { WalletProvider } from '@/lib/wallet-context'
import { ThemeProvider } from '@/lib/theme-context'
import { UploadProvider } from '@/lib/upload-context'
import { ChatWidgetProvider } from '@/lib/chat-widget-context'

export default function Providers({ children, isStudioDomain = false }: { children: React.ReactNode; isStudioDomain?: boolean }) {
  return (
    <ThemeProvider isStudioDomain={isStudioDomain}>
      <UploadProvider>
        <SessionProvider>
          <WalletProvider>
            <ChatWidgetProvider>
              {children}
            </ChatWidgetProvider>
          </WalletProvider>
        </SessionProvider>
      </UploadProvider>
    </ThemeProvider>
  )
}
