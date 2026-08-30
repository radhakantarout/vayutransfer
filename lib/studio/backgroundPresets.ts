import type { WebsiteTemplateId } from '@/types/studio'

// Single source of truth for which background presets exist per template —
// read by WebsiteManager.tsx to render the Background swatch row (Template
// tab), and mirrored inside each template file's own BACKGROUND_PRESETS
// constant (the actual hex values used to paint sections). Kept here too,
// separately, only for the label/swatch metadata the dashboard needs —
// duplicating the small {id,label,swatch} shape is simpler and safer than
// importing a server/client-agnostic constant out of a 'use client'-free
// template file into the dashboard bundle.
//
// 'default' always exists for every template and matches its original,
// pre-preset hardcoded colors exactly — this is what an existing site with
// no backgroundPreset set renders today, unchanged.
export interface BackgroundPresetOption {
  id: string
  label: string
  swatch: string // CSS color/gradient for the picker UI
}

export const BACKGROUND_PRESET_OPTIONS: Record<WebsiteTemplateId, BackgroundPresetOption[]> = {
  lumina: [
    { id: 'default', label: 'Charcoal', swatch: '#0A0A0A' },
    { id: 'maroon',  label: 'Maroon & Gold', swatch: '#3B0A1A' },
    { id: 'teal',    label: 'Teal & Copper', swatch: '#0A1615' },
  ],
  clarity: [
    { id: 'default', label: 'White',      swatch: '#FFFFFF' },
    { id: 'ivory',   label: 'Warm Ivory', swatch: '#FBF8F3' },
    { id: 'cool',    label: 'Cool Grey',  swatch: '#F7F8FA' },
  ],
  ember: [
    { id: 'default',    label: 'Warm Cream', swatch: '#FAF6F1' },
    { id: 'terracotta', label: 'Terracotta', swatch: '#FBF1E7' },
    { id: 'sage',       label: 'Sage',       swatch: '#F6F7F0' },
  ],
  bold: [
    { id: 'default', label: 'Black',    swatch: '#000000' },
    { id: 'wine',    label: 'Deep Red', swatch: '#1A0505' },
    { id: 'ink',     label: 'Ink Blue', swatch: '#00040D' },
  ],
  bloom: [
    { id: 'default',  label: 'Blush',     swatch: '#FDF8F6' },
    { id: 'lavender', label: 'Lavender',  swatch: '#FAF8FD' },
    { id: 'mint',     label: 'Mint',      swatch: '#F7FBF9' },
  ],
  frame: [
    { id: 'default',  label: 'White',        swatch: '#FFFFFF' },
    { id: 'ivory',    label: 'Warm Ivory',   swatch: '#FBF8F3' },
    { id: 'concrete', label: 'Cool Concrete', swatch: '#F2F1EF' },
  ],
  zari: [
    { id: 'default', label: 'Ivory',      swatch: '#FBF7F0' },
    { id: 'rose',    label: 'Rose Quartz', swatch: '#FBF2EF' },
    { id: 'sage',    label: 'Soft Sage',   swatch: '#F6F8F0' },
  ],
  monsoon: [
    { id: 'default',  label: 'Deep Navy', swatch: '#0B1622' },
    { id: 'charcoal', label: 'Charcoal',  swatch: '#14171C' },
    { id: 'plum',     label: 'Deep Plum', swatch: '#170F1E' },
  ],
}
