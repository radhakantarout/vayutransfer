import { Noto_Sans_Devanagari, Noto_Sans_Oriya, Noto_Sans_Bengali, Noto_Sans_Tamil, Noto_Sans_Telugu } from 'next/font/google'

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
const notoBengali    = Noto_Sans_Bengali({ subsets: ['bengali'], weight: ['400', '500', '600', '700'], variable: '--font-noto-bengali', display: 'swap' })
const notoTamil      = Noto_Sans_Tamil({ subsets: ['tamil'], weight: ['400', '500', '600', '700'], variable: '--font-noto-tamil', display: 'swap' })
const notoTelugu     = Noto_Sans_Telugu({ subsets: ['telugu'], weight: ['400', '500', '600', '700'], variable: '--font-noto-telugu', display: 'swap' })

export default function StudioSiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${notoDevanagari.variable} ${notoOriya.variable} ${notoBengali.variable} ${notoTamil.variable} ${notoTelugu.variable}`}>
      {children}
    </div>
  )
}
