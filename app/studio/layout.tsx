import type { Metadata } from 'next'
import StudioChrome from '@/components/studio/StudioChrome'

export const metadata: Metadata = {
  title: 'VayuStudios — Gallery Delivery for Photographers',
  description:
    'Deliver wedding and event galleries to your clients. Let them select photos, add comments, and download their prints.',
  // Same asset StudioNavbar.tsx already uses for VayuStudios' own in-app
  // logo — set explicitly here (not just relying on inheriting the root
  // layout's icons) since vayustudios.com traffic is routed to this segment.
  icons: { icon: '/logo.png', shortcut: '/logo.png', apple: '/logo.png' },
}

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return <StudioChrome>{children}</StudioChrome>
}
