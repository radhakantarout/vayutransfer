import { Noto_Sans_Devanagari, Noto_Sans_Oriya, Noto_Sans_Tamil, Noto_Sans_Telugu } from 'next/font/google'
// Noto_Sans_Bengali temporarily removed (2026-11-20) -- Vercel's build was
// deterministically failing to fetch/parse its Google Fonts CSS response
// (TypeError in next/font's loader.js, reproduced on 4 consecutive build
// attempts), blocking an urgent unrelated production hotfix. Restore once
// the underlying next/font/Google Fonts issue is understood.

// None of the 8 (growing) templates' fonts (Georgia, Helvetica, Cormorant
// Garamond, Palatino, Inter) have glyphs for Devanagari/Oriya/Bengali/Tamil/
// Telugu — without this, a site set to Hindi/Odia/Bengali/Tamil/Telugu would
// silently fall back to a generic system font for that script. Loaded here
// (not the root app layout) so this only affects public studio sites, never
// the dashboard or VayuTransfer. Safe to expose unconditionally: CSS
// font-family fallback is per-glyph, so appending these after a template's
// primary font never changes how English (or any Latin-script name/street
// address inside otherwise-English copy) renders.
const notoDevanagari = Noto_Sans_Devanagari({ subsets: ['devanagari'], weight: ['400', '500', '600', '700'], variable: '--font-noto-devanagari', display: 'swap' })
const notoOriya      = Noto_Sans_Oriya({ subsets: ['oriya'], weight: ['400', '500', '600', '700'], variable: '--font-noto-oriya', display: 'swap' })
const notoTamil      = Noto_Sans_Tamil({ subsets: ['tamil'], weight: ['400', '500', '600', '700'], variable: '--font-noto-tamil', display: 'swap' })
const notoTelugu     = Noto_Sans_Telugu({ subsets: ['telugu'], weight: ['400', '500', '600', '700'], variable: '--font-noto-telugu', display: 'swap' })

export default function StudioSiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${notoDevanagari.variable} ${notoOriya.variable} ${notoTamil.variable} ${notoTelugu.variable}`}>
      {children}
    </div>
  )
}
