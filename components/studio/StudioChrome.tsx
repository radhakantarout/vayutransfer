'use client'

import { usePathname } from 'next/navigation'
import StudioNavbar from './StudioNavbar'
import ConditionalFooter from './ConditionalFooter'
import ChatWidget from './ChatWidget'
import { ExpandedGridProvider, useExpandedGrid } from './ExpandedGridContext'
import { ChatWidgetProvider } from './ChatWidgetContext'

function Chrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { expanded } = useExpandedGrid()
  // The marketing navbar never belongs inside the authenticated admin app —
  // it's the logged-out/marketing site's chrome (Pricing/Events/Examples).
  // navCollapsed (dashboard-only "give the gallery more room" signal) is
  // deliberately NOT part of this — it's a piece of shared context state
  // that stays true after navigating away from the dashboard, which used to
  // leak into non-admin pages like /studio/home and hide their navbar too.
  const isAdminApp = pathname.startsWith('/studio/dashboard')
  const hideNavbar = isAdminApp || expanded

  return (
    // Admin app clips to exactly the viewport height so its internal
    // flex-1/overflow-y-auto regions (sidebar's project tree, main content)
    // scroll on their own — otherwise the whole page grows taller than the
    // screen and pinned sidebar sections (Settings/Storage/AI/profile) end
    // up below the fold, needing a page-scroll to reach. h-dvh (not
    // h-screen/100vh) — mobile browsers' address bar showing/hiding changes
    // the real visible viewport, and 100vh doesn't track that, so the
    // pinned bottom group was getting clipped below the actually-visible
    // screen on mobile even though desktop looked fine.
    <div className={`${isAdminApp ? 'h-dvh overflow-hidden' : 'min-h-screen'} bg-bg text-text-primary flex flex-col`}>
      {!hideNavbar && <StudioNavbar />}
      {/* min-h-0 is required here too — without it this flex-1 wrapper
          refuses to shrink below its content's natural height (flexbox's
          default min-height:auto), so a tall sidebar (e.g. once the "current
          project" card appears) grew the whole wrapper past the viewport
          instead of clipping to it, defeating the h-screen constraint above
          and pushing Settings/Storage/AI/profile below the fold again. */}
      <div className="flex-1 min-h-0 flex flex-col">
        {children}
      </div>
      {!expanded && <ConditionalFooter />}
      {/* Admin dashboard: no floating trigger bubble by default (looked
          cluttered on every page) — the sidebar's "?" Help icon is the only
          way in, opening this same panel via ChatWidgetContext. Marketing
          pages keep the floating trigger since they have no Help icon. */}
      {!expanded && <ChatWidget showTrigger={!isAdminApp} />}
    </div>
  )
}

export default function StudioChrome({ children }: { children: React.ReactNode }) {
  return (
    <ExpandedGridProvider>
      <ChatWidgetProvider>
        <Chrome>{children}</Chrome>
      </ChatWidgetProvider>
    </ExpandedGridProvider>
  )
}
