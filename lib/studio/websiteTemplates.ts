import type { WebsiteTemplateId } from '@/types/studio'

// Single source of truth for the 5 (growing) built-in website templates —
// imported by the dashboard's Template tab UI (WebsiteManager.tsx) and by the
// AI template-picker route (app/studio/api/ai/website-template/route.ts), which
// needs the same list both to build its prompt and to validate the model's
// answer against real ids before trusting it.
export interface WebsiteTemplateMeta {
  id: WebsiteTemplateId
  name: string
  desc: string
  preview: string
}

export const WEBSITE_TEMPLATES: WebsiteTemplateMeta[] = [
  { id: 'lumina',  name: 'Lumina',  desc: 'Dark & elegant, full-bleed',      preview: 'bg-gradient-to-br from-zinc-900 to-amber-950' },
  { id: 'clarity', name: 'Clarity', desc: 'Minimal white, editorial',        preview: 'bg-gradient-to-br from-white to-gray-100' },
  { id: 'ember',   name: 'Ember',   desc: 'Warm earth tones, soft',          preview: 'bg-gradient-to-br from-orange-50 to-amber-100' },
  { id: 'bold',    name: 'Bold',    desc: 'High contrast, large typography', preview: 'bg-gradient-to-br from-zinc-950 to-red-950' },
  { id: 'bloom',   name: 'Bloom',   desc: 'Pastel, feminine, romantic',      preview: 'bg-gradient-to-br from-pink-50 to-rose-100' },
]
