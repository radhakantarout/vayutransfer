'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type MomentsTheme = 'dark' | 'light'

const STORAGE_KEY = 'vayustudio-moments-theme'

const MomentsThemeContext = createContext<{ theme: MomentsTheme; toggle: () => void }>({
  theme: 'dark',
  toggle: () => {},
})

// VayuStudios Moments' own theme — completely independent of the shared
// vayustudio-theme (lib/theme-context.tsx) that Studio Admin/Client
// Gallery/Guest use: its own localStorage key, its own default (dark, not
// light), and applied via a scoped .moments-dark class on this provider's
// own wrapper div rather than the global <html> element those other
// surfaces toggle. That's what makes this safe to default to dark without
// touching anything outside Moments — no shared file, storage key, or DOM
// node is shared with the other theme system.
export function MomentsThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<MomentsTheme>('dark')

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') setTheme(stored)
  }, [])

  const toggle = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }

  return (
    <MomentsThemeContext.Provider value={{ theme, toggle }}>
      <div className={theme === 'dark' ? 'moments-dark' : undefined}>
        {children}
      </div>
    </MomentsThemeContext.Provider>
  )
}

export const useMomentsTheme = () => useContext(MomentsThemeContext)
