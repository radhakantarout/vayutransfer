import type { CSSProperties } from 'react'
import type { SectionEmphasis } from '@/types/studio'

// Maps to inline styles, not additional Tailwind classes — two utility
// classes of equal specificity (e.g. a template's own `font-light` vs. an
// override `font-bold`) don't reliably override each other based on JSX
// source order (cascade order depends on Tailwind's generated stylesheet
// order, not where the class appears in the string), so a class-based
// override would be flaky. Inline `style` always wins regardless.
export function emphasisTextStyle(emphasis?: SectionEmphasis): CSSProperties {
  switch (emphasis) {
    case 'bold':   return { fontWeight: 700 }
    case 'subtle': return { opacity: 0.65, fontWeight: 300 }
    case 'italic': return { fontStyle: 'italic' }
    default:       return {}
  }
}

export const EMPHASIS_OPTIONS: { id: SectionEmphasis; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'bold',   label: 'Bold' },
  { id: 'subtle', label: 'Subtle' },
  { id: 'italic', label: 'Italic' },
]

// A small curated set spanning light/dark/neutral — deliberately not a bare
// free-text hex field, matching the same "curated over arbitrary" choice
// already made for accent/font colors and background presets elsewhere in
// this builder. The dashboard still offers a "Custom" swatch backed by a
// native color input for anyone who wants an exact hex.
export const SECTION_BG_SWATCHES: string[] = [
  '#FFFFFF', '#F5F0E8', '#F2F1EF', '#1A1A1A', '#0A0A0A', '#0B1622', '#3B0A1A',
]
