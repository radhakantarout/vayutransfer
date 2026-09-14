import type { Metadata } from 'next'
import { MomentsThemeProvider } from '@/lib/momentsTheme'

// Only resolves for pages under this route segment — Studio Admin, Client
// Gallery, Guest, and VayuTransfer never pick up this manifest/PWA metadata
// since they're served through app/studio/layout.tsx and app/layout.tsx,
// which don't declare it.
export const metadata: Metadata = {
  manifest: '/moments-manifest.json',
  appleWebApp: { capable: true, title: 'Moments', statusBarStyle: 'default' },
}

// Scoped to every /studio/moments/* route (landing, search, new, a specific
// gallery, join links, register) — see lib/momentsTheme.tsx for why this is
// fully independent of the shared vayustudio-theme used elsewhere in
// VayuStudios, and untouched by/invisible to VayuTransfer entirely.
export default function MomentsLayout({ children }: { children: React.ReactNode }) {
  return <MomentsThemeProvider>{children}</MomentsThemeProvider>
}
