'use client'

import { createContext, useContext, useState } from 'react'

// Lets a deeply-nested EventSection (inside the dashboard layout) tell the
// top-level StudioLayout to hide the sticky navbar while its event grid is
// expanded to fullscreen — without prop-drilling through the dashboard layout.
interface ExpandedGridState {
  expanded: boolean
  setExpanded: (v: boolean) => void
}

const ExpandedGridContext = createContext<ExpandedGridState>({
  expanded: false,
  setExpanded: () => {},
})

export function ExpandedGridProvider({ children }: { children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <ExpandedGridContext.Provider value={{ expanded, setExpanded }}>
      {children}
    </ExpandedGridContext.Provider>
  )
}

export function useExpandedGrid() {
  return useContext(ExpandedGridContext)
}
