import { MomentsThemeProvider } from '@/lib/momentsTheme'

// Scoped to every /studio/moments/* route (landing, search, new, a specific
// gallery, join links, register) — see lib/momentsTheme.tsx for why this is
// fully independent of the shared vayustudio-theme used elsewhere in
// VayuStudios, and untouched by/invisible to VayuTransfer entirely.
export default function MomentsLayout({ children }: { children: React.ReactNode }) {
  return <MomentsThemeProvider>{children}</MomentsThemeProvider>
}
