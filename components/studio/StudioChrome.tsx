'use client'

import StudioNavbar from './StudioNavbar'
import ConditionalFooter from './ConditionalFooter'
import ChatWidget from './ChatWidget'
import { ExpandedGridProvider, useExpandedGrid } from './ExpandedGridContext'

function Chrome({ children }: { children: React.ReactNode }) {
  const { expanded } = useExpandedGrid()
  return (
    <div className="min-h-screen bg-bg text-text-primary flex flex-col">
      {!expanded && <StudioNavbar />}
      <div className="flex-1 flex flex-col">
        {children}
      </div>
      {!expanded && <ConditionalFooter />}
      {!expanded && <ChatWidget />}
    </div>
  )
}

export default function StudioChrome({ children }: { children: React.ReactNode }) {
  return (
    <ExpandedGridProvider>
      <Chrome>{children}</Chrome>
    </ExpandedGridProvider>
  )
}
