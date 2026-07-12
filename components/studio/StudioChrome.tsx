'use client'

import StudioNavbar from './StudioNavbar'
import ConditionalFooter from './ConditionalFooter'
import ChatWidget from './ChatWidget'
import { ExpandedGridProvider, useExpandedGrid } from './ExpandedGridContext'

function Chrome({ children }: { children: React.ReactNode }) {
  const { expanded, navCollapsed, setNavCollapsed } = useExpandedGrid()
  const hideNavbar = expanded || navCollapsed

  return (
    <div className="min-h-screen bg-bg text-text-primary flex flex-col">
      {!hideNavbar && <StudioNavbar />}
      {/* Only appears when the dashboard auto-collapsed the navbar for an
          open event gallery — lets the admin peek at it without leaving. */}
      {!expanded && navCollapsed && (
        <button onClick={() => setNavCollapsed(false)} title="Show navbar"
          className="self-center sticky top-0 z-50 flex items-center gap-1 px-3 py-0.5 bg-card border border-t-0 border-border rounded-b-lg text-[9px] font-bold text-muted hover:text-text-primary hover:bg-border/60 transition-colors shadow-sm">
          <svg className="w-2.5 h-2.5 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          SHOW
        </button>
      )}
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
