import type { Metadata } from 'next'
import StudioChrome from '@/components/studio/StudioChrome'

export const metadata: Metadata = {
  title: 'VayuStudios — Gallery Delivery for Photographers',
  description:
    'Deliver wedding and event galleries to your clients. Let them select photos, add comments, and download their prints.',
}

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return <StudioChrome>{children}</StudioChrome>
}
