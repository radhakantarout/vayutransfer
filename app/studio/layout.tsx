import type { Metadata } from 'next'
import StudioNavbar from '@/components/studio/StudioNavbar'
import StudioFooter from '@/components/studio/StudioFooter'

export const metadata: Metadata = {
  title: 'VayuStudios — Gallery Delivery for Photographers',
  description:
    'Deliver wedding and event galleries to your clients. Let them select photos, add comments, and download their prints.',
}

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen bg-bg text-text-primary flex flex-col overflow-hidden">
      <StudioNavbar />
      <div className="flex-1 flex flex-col overflow-auto min-h-0">
        {children}
        <StudioFooter />
      </div>
    </div>
  )
}
