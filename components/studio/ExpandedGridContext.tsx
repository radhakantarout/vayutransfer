'use client'

import { createContext, useContext, useState } from 'react'

// Lets a deeply-nested EventSection (inside the dashboard layout) tell the
// top-level StudioLayout to hide the sticky navbar while its event grid is
// expanded to fullscreen — without prop-drilling through the dashboard layout.
//
// navCollapsed is a second, independent signal: the dashboard layout sets it
// whenever any event is selected (auto-hiding the navbar to give the gallery
// more room), and clears it whenever selection changes or is cleared. It's
// deliberately separate from `expanded` (true fullscreen) so the two never
// fight over the same boolean — e.g. exiting fullscreen on an event that's
// still selected shouldn't re-show the navbar.
interface ExpandedGridState {
  expanded: boolean
  setExpanded: (v: boolean) => void
  navCollapsed: boolean
  setNavCollapsed: (v: boolean) => void
}

const ExpandedGridContext = createContext<ExpandedGridState>({
  expanded: false,
  setExpanded: () => {},
  navCollapsed: false,
  setNavCollapsed: () => {},
})

export function ExpandedGridProvider({ children }: { children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  const [navCollapsed, setNavCollapsed] = useState(false)
  return (
    <ExpandedGridContext.Provider value={{ expanded, setExpanded, navCollapsed, setNavCollapsed }}>
      {children}
    </ExpandedGridContext.Provider>
  )
}

export function useExpandedGrid() {
  return useContext(ExpandedGridContext)
}
