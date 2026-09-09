// AI Reel Generator — provider config + pricing engine. Single source of
// truth, same "one constants file, cost basis documented in comments"
// philosophy as constants/studioPricing.ts. See
// "VayuStudios AI Reel Generator - Design Document.md" (repo root), §4.2 and
// §7, for the full reasoning behind every constant below.
//
// IMPORTANT: KLING_COST_PAISE_PER_AI_SECOND is a PROVISIONAL estimate
// (design doc's resolved decision #1) — not yet confirmed against a real
// Kling developer-console quote. Everything downstream (credit costs, pack
// margins) is correct *relative to* this one number; the moment a real
// quote is available, update this single constant and every future reel
// reprices itself correctly with zero other code changes.

// ── Provider router config ──────────────────────────────────────────────
// Only Kling is enabled/implemented. Runway/Luma/Veo are stubs so the
// router's selection logic and the frontend never need to change when a
// real provider is added later — flip `enabled: true` and set a real
// priority, nothing else.
export const VIDEO_PROVIDER_CONFIG = {
  kling:  { enabled: true,  priority: 1 },
  runway: { enabled: false, priority: 2 },
  luma:   { enabled: false, priority: 3 },
  veo:    { enabled: false, priority: 4 },
} as const
export type VideoProviderName = keyof typeof VIDEO_PROVIDER_CONFIG

// ── Reel configuration defaults ─────────────────────────────────────────
export const MIN_REEL_PHOTOS = 5
export const RECOMMENDED_REEL_PHOTOS_MIN = 8
export const RECOMMENDED_REEL_PHOTOS_MAX = 15
export const MAX_REEL_PHOTOS = 30

export const REEL_STYLES = ['CINEMATIC', 'ROMANTIC', 'BOLLYWOOD', 'LUXURY', 'MEMORIES', 'PHOTOGRAPHERS_CHOICE'] as const
export const DEFAULT_REEL_STYLE = 'CINEMATIC'

// Display metadata + the Kling prompt fragment each style maps to. Labels
// lean into the vocabulary clients actually think in ("Storytelling",
// "Emotional") rather than the internal enum names — MEMORIES reads as
// "Storytelling" (nostalgic narrative flow) and PHOTOGRAPHERS_CHOICE reads
// as "Emotional" (raw, adaptive, no fixed mood) in the UI, no new enum
// values needed for that vocabulary.
//
// `colors` are real hex values applied via inline `style` (a CSS
// `linear-gradient(...)`), NOT Tailwind gradient utility classes — a real
// bug taught this the hard way: these values live in this constants/ file,
// which Tailwind's JIT scanner didn't cover, so `bg-gradient-to-br
// from-X via-Y to-Z` string classes built from this data were silently
// never generated at all (looked "fine" in dark mode by accident — white
// text over a transparent fallback happened to read against a dark
// backdrop — and was invisible white-on-white in light mode). Plain hex
// colors applied inline sidestep Tailwind's scanning entirely, so this
// can't recur no matter which files the content glob covers.
// `energy` (1-5) drives the small gamified intensity-meter shown on each
// card — flavor only, not used anywhere in the pipeline.
export const REEL_STYLE_META: Record<(typeof REEL_STYLES)[number], {
  label: string; description: string; colors: [string, string, string]; icon: string; energy: number; promptFragment: string
}> = {
  CINEMATIC: {
    label: 'Cinematic', description: 'Film-grade motion, dramatic light',
    colors: ['#334155', '#1e293b', '#000000'], icon: '🎬', energy: 3,
    promptFragment: 'cinematic film look, dramatic natural lighting, smooth deliberate camera movement',
  },
  ROMANTIC: {
    label: 'Romantic', description: 'Soft, dreamy, tender',
    colors: ['#fda4af', '#fb7185', '#e11d48'], icon: '💕', energy: 2,
    promptFragment: 'soft romantic mood, warm gentle lighting, tender intimate motion',
  },
  BOLLYWOOD: {
    label: 'Bollywood', description: 'Vibrant, high-energy',
    colors: ['#fbbf24', '#f97316', '#dc2626'], icon: '🎉', energy: 5,
    promptFragment: 'vibrant energetic mood, rich warm golden tones, lively expressive motion',
  },
  LUXURY: {
    label: 'Luxury', description: 'Elegant gold, glamour',
    colors: ['#ca8a04', '#a16207', '#422006'], icon: '👑', energy: 2,
    promptFragment: 'elegant luxurious mood, refined slow motion, soft golden glow',
  },
  MEMORIES: {
    label: 'Storytelling', description: 'Nostalgic narrative flow',
    colors: ['#2dd4bf', '#0891b2', '#164e63'], icon: '📖', energy: 2,
    promptFragment: 'nostalgic storytelling mood, gentle drifting motion, warm timeless tone',
  },
  PHOTOGRAPHERS_CHOICE: {
    label: 'Emotional', description: 'Raw, heartfelt, natural',
    colors: ['#c084fc', '#7c3aed', '#312e81'], icon: '🤍', energy: 3,
    promptFragment: 'raw authentic emotional mood, subtle natural motion, heartfelt intimacy',
  },
}

export const REEL_ASPECT_RATIOS = ['9:16', '4:5', '16:9'] as const
export const DEFAULT_REEL_ASPECT_RATIO = '9:16'

// Target pixel dimensions per aspect ratio — Kling's confirmed API has no
// aspect_ratio request field at all (design doc §7's Kling integration
// notes), so hitting the chosen ratio is a post-processing crop/scale step
// in the reelgen Lambda's final ffmpeg encode, not something Kling does.
export const REEL_ASPECT_RATIO_DIMENSIONS: Record<(typeof REEL_ASPECT_RATIOS)[number], { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '4:5':  { width: 1080, height: 1350 },
  '16:9': { width: 1920, height: 1080 },
}

// "Template" is a platform-friendly label over aspect ratio — clients think
// in terms of where the reel is going (Instagram/Shorts/Facebook), not raw
// ratios. Instagram Reels and YouTube Shorts share 9:16 but are kept as
// distinct options since that's how users actually choose, not collapsed
// into one "vertical" option.
export interface ReelTemplate {
  id: 'instagram_reel' | 'youtube_shorts' | 'facebook'
  label: string
  aspectRatio: (typeof REEL_ASPECT_RATIOS)[number]
  icon: string
}
export const REEL_TEMPLATES: ReelTemplate[] = [
  { id: 'instagram_reel', label: 'Instagram Reels', aspectRatio: '9:16', icon: '📱' },
  { id: 'youtube_shorts', label: 'YouTube Shorts', aspectRatio: '9:16', icon: '▶️' },
  { id: 'facebook', label: 'Facebook', aspectRatio: '4:5', icon: '👍' },
]
export const DEFAULT_REEL_TEMPLATE = 'instagram_reel'

export function getReelTemplate(templateId: string): ReelTemplate | undefined {
  return REEL_TEMPLATES.find((t) => t.id === templateId)
}

export const REEL_RESOLUTIONS = ['720p', '1080p'] as const
export const DEFAULT_REEL_RESOLUTION = '1080p'

export const REEL_DURATIONS = [15, 30, 45, 60] as const
export const DEFAULT_REEL_DURATION_SEC = 30

export const REEL_MOTION_LIBRARY = [
  'slow_push_in', 'slow_pull_out', 'left_to_right', 'right_to_left', 'orbit', 'parallax',
  'portrait_focus', 'couple_reveal', 'group_zoom_out', 'detail_push', 'cinematic_pan',
] as const

// Hybrid generation: only a handful of "hero" photos get real AI video, the
// rest get FFmpeg Ken Burns/pan/zoom (design doc §4.3, brief's own "HYBRID
// AI GENERATION" section). This is a placeholder estimate for the live
// cost-preview UI before the real photo-analysis/story-planner (Phase 1
// step 3) runs — it will be superseded by the pipeline's actual computed
// heroClipCount once that exists, this is only for showing the user a
// credit-cost number before they click generate.
export const DEFAULT_HERO_CLIP_RATIO = 0.5
export const MIN_HERO_CLIPS = 3
export const MAX_HERO_CLIPS = 6
export const DEFAULT_AI_CLIP_DURATION_SEC = 3

export function estimateHeroClipCount(photoCount: number): number {
  const raw = Math.round(photoCount * DEFAULT_HERO_CLIP_RATIO)
  return Math.min(MAX_HERO_CLIPS, Math.max(MIN_HERO_CLIPS, raw))
}

// ── Dynamic per-video pricing (design doc §7) ───────────────────────────
// Forex/cost-basis assumption aligned to constants/studioPricing.ts's own
// documented rate (~₹97/$1, July 2026) for consistency across the codebase.
export const KLING_COST_PAISE_PER_AI_SECOND = 970 // ~$0.10/s AI-video-second, no audio, 1080p — PROVISIONAL, see file header
export const FIXED_OVERHEAD_PAISE_PER_REEL = 400  // Rekognition analysis + Lambda compute + R2 storage, ~₹4/reel
export const TARGET_MARGIN = 0.55                 // matches the ~50-60% band storage/AI-search already target
export const MIN_MARGIN_FLOOR = 0.35              // hard floor — stacked pack+annual discounts must never price below this
export const CREDIT_VALUE_PAISE = 8000            // ₹80/credit retail value

export interface ReelCostEstimate {
  rawCostPaise: number
  sellPricePaise: number
  creditsRequired: number
}

// The one formula every reel's credit cost derives from — computed
// server-side at request time from the ACTUAL configuration (hero clip
// count + their length), never a flat per-duration bucket. See design doc
// §7 for why this matters for margin protection.
export function computeReelCost(heroClipCount: number, avgClipDurationSec: number): ReelCostEstimate {
  const rawCostPaise = Math.round(
    heroClipCount * avgClipDurationSec * KLING_COST_PAISE_PER_AI_SECOND + FIXED_OVERHEAD_PAISE_PER_REEL
  )
  const sellPricePaise = Math.round(rawCostPaise / (1 - TARGET_MARGIN))
  const creditsRequired = Math.max(1, Math.ceil(sellPricePaise / CREDIT_VALUE_PAISE))
  return { rawCostPaise, sellPricePaise, creditsRequired }
}

// ── Credit packs (payment-UX bulk discount, not a separate pricing model —
// see design doc §7's "Credit packs" + "Annual Pro/Custom loyalty discount")
export interface ReelCreditPack {
  id: 'starter' | 'studio' | 'pro'
  credits: number
  monthlyPricePaise: number
  annualPricePaise: number // extra loyalty discount for Studio.billingCycle === 'annual'
}

export const REEL_CREDIT_PACKS: ReelCreditPack[] = [
  { id: 'starter', credits: 5,  monthlyPricePaise: 36000,  annualPricePaise: 32400 },  // 10% off
  { id: 'studio',  credits: 20, monthlyPricePaise: 136000, annualPricePaise: 122400 }, // 10% off
  { id: 'pro',     credits: 60, monthlyPricePaise: 384000, annualPricePaise: 337920 }, // 12% off
]

export function getReelCreditPack(packId: string): ReelCreditPack | undefined {
  return REEL_CREDIT_PACKS.find((p) => p.id === packId)
}

// billingCycle undefined/'monthly' -> monthly price. Only studios actually
// on annual billing get the deeper discount — a Free-plan studio (no
// billingCycle at all) is priced at the monthly rate, same as a Pro-monthly
// studio; there's no annual concept without an annual plan underneath it.
export function packPricePaise(pack: ReelCreditPack, billingCycle?: 'monthly' | 'annual'): number {
  return billingCycle === 'annual' ? pack.annualPricePaise : pack.monthlyPricePaise
}

// Effective gross margin a pack sells at, assuming an average cost-per-
// credit derived from CREDIT_VALUE_PAISE/TARGET_MARGIN (the consumption-side
// cost baked into every credit). Used to keep pack/annual discounts honest
// against MIN_MARGIN_FLOOR — not enforced at runtime (packs are fixed
// constants, not user input), but a guard for whoever edits these numbers
// later.
export function packEffectiveMarginPct(pack: ReelCreditPack, billingCycle?: 'monthly' | 'annual'): number {
  const costPerCreditPaise = CREDIT_VALUE_PAISE * (1 - TARGET_MARGIN)
  const pricePerCreditPaise = packPricePaise(pack, billingCycle) / pack.credits
  return Math.round(((pricePerCreditPaise - costPerCreditPaise) / pricePerCreditPaise) * 100)
}
