'use client'

import { usePathname } from 'next/navigation'
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

// Footer stays visible for signed-in VayuTransfer users too — VayuStudios
// (/studio) and the platform admin app (/admin) still never show it.
export function ConditionalFooter() {
  const pathname = usePathname()
  if (pathname.startsWith('/studio')) return null
  if (pathname.startsWith('/admin')) return null
  return <Footer />
}
