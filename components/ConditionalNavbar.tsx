'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import Navbar from './Navbar'
import Footer from './Footer'

// Navbar shows on every page, at every breakpoint — its own internal
// session check trims it down once signed in (see Navbar.tsx). No route is
// chromeless anymore; the sidebar+navbar combo stays up throughout the
// whole signed-in session, including the New Transfer flow.
//
// ?from=moments (used by shared pages like /privacy and /terms when opened
// from Moments' Profile) also suppresses this — those pages live outside
// /studio, so without this a Moments user opening "Privacy notice" saw
// VayuTransfer's own marketing navbar/footer around it, which reads as an
// abrupt jump to a different product. Every other visitor to these pages
// (without the param) sees the exact same navbar/footer as before.
export function ConditionalNavbar() {
  const pathname = usePathname()
  const fromMoments = useSearchParams().get('from') === 'moments'
  if (pathname.startsWith('/studio')) return null
  if (pathname.startsWith('/admin')) return null
  if (fromMoments) return null
  return <Navbar />
}

// Footer stays visible for signed-in VayuTransfer users too — VayuStudios
// (/studio) and the platform admin app (/admin) still never show it.
export function ConditionalFooter() {
  const pathname = usePathname()
  const fromMoments = useSearchParams().get('from') === 'moments'
  if (pathname.startsWith('/studio')) return null
  if (pathname.startsWith('/admin')) return null
  if (fromMoments) return null
  return <Footer />
}
