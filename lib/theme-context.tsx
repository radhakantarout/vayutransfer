'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'light',
  toggle: () => {},
})

// VayuTransfer and VayuStudios are different products for different users —
// each gets its own localStorage key and its own default, so a preference
// set on one never bleeds into the other (matters most in local dev, where
// both run on the same origin/port; production domains are already
// same-origin-isolated by the browser but this keeps the two explicit).
// VayuTransfer intentionally defaults dark (2026-08-07 home redesign);
// VayuStudios defaults light, as it always has.
export function ThemeProvider({ children, isStudioDomain = false }: { children: React.ReactNode; isStudioDomain?: boolean }) {
  const storageKey = isStudioDomain ? 'vayustudio-theme' : 'vayu-theme'
  const defaultTheme: Theme = isStudioDomain ? 'light' : 'dark'
  const [theme, setTheme] = useState<Theme>(defaultTheme)

  useEffect(() => {
    const stored = localStorage.getItem(storageKey) as Theme | null
    const initial = stored ?? defaultTheme
    setTheme(initial)
    document.documentElement.classList.toggle('dark', initial === 'dark')
  }, [storageKey, defaultTheme])

  const toggle = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem(storageKey, next)
      document.documentElement.classList.toggle('dark', next === 'dark')
      return next
    })
  }

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
