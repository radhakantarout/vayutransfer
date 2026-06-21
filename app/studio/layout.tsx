import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'VayuStudio — Gallery Delivery for Photographers',
  description: 'Deliver wedding and event galleries to your clients. Let them select photos, add comments, and download their prints.',
}

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-text-primary">
      {children}
    </div>
  )
}
