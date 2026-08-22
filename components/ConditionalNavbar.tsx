'use client'

import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Navbar from './Navbar'
import Footer from './Footer'

// Navbar shows on every page, at every breakpoint — its own internal
// session check trims it down once signed in (see Navbar.tsx). No route is
// chromeless anymore; the sidebar+navbar combo stays up throughout the
// whole signed-in session, including the New Transfer flow.
export function ConditionalNavbar() {
  const pathname = usePathname()
  if (pathname.startsWith('/studio')) return null
  if (pathname.startsWith('/admin')) return null
  return <Navbar />
}

// Footer is marketing chrome — dropped once signed in (the sidebar is the
// permanent app shell then), kept for anonymous visitors everywhere else.
export function ConditionalFooter() {
  const pathname = usePathname()
  const { data: session } = useSession()
  if (pathname.startsWith('/studio')) return null
  if (pathname.startsWith('/admin')) return null
  if (session) return null
  return <Footer />
}
