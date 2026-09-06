'use client'

import { createContext, useContext, useState } from 'react'

// Lets a deeply-nested editor (currently just WebsiteManager) publish "I
// have unsaved changes" up to the dashboard sidebar (app/studio/(studio-
// admin)/dashboard/layout.tsx), which is a route sibling, not a parent, so
// this can't be plain props. The sidebar's own navigation-away actions
// (switching to Client Gallery / My Booking, logging out) read this before
// actually navigating and confirm with the admin first — beforeunload
// already covers an actual browser refresh/close, but that API can't
// intercept an in-app client-side route change, which is the gap this fills.
interface UnsavedChangesState {
  hasUnsavedChanges: boolean
  setHasUnsavedChanges: (v: boolean) => void
}

const UnsavedChangesContext = createContext<UnsavedChangesState>({
  hasUnsavedChanges: false,
  setHasUnsavedChanges: () => {},
})

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  return (
    <UnsavedChangesContext.Provider value={{ hasUnsavedChanges, setHasUnsavedChanges }}>
      {children}
    </UnsavedChangesContext.Provider>
  )
}

export function useUnsavedChanges() {
  return useContext(UnsavedChangesContext)
}
