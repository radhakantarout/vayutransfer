import type { WalletTopupTier } from '@/types'

// ─── Simple pay-as-you-transfer pricing (post S3→R2 migration) ────────────
// R2 has zero egress/download cost, so there's no separate "per download"
// charge anymore — one flat rate covers storage + unlimited downloads
// until the link expires. No free tier or monthly quota — every transfer
// is charged ₹4.99/GB of its exact size, full stop. New signups start with
// a ₹50 wallet bonus (see lib/users.ts), which is just ordinary balance —
// nothing about it is tracked as "free quota" separately.
export const FLAT_RATE_PAISE_PER_GB = 499   // ₹4.99/GB

// Not billed, not shown to the user as a "limit" — a generous ceiling that
// only exists to stop a single link from being hammered by a script.
export const MAX_DOWNLOADS_PER_LINK = 200

export const DEFAULT_EXPIRY_HOURS = 24  // superseded by DEFAULT_EXPIRY_DAYS below, kept to avoid churn on the constant itself

// Retention model: the R2 bucket has a hard, unconditional 20-day-from-
// upload delete rule (can't be made conditional — object lifecycle rules
// don't know about app state). The app never promises more than 19 days
// from createdAt, leaving a 1-day safety margin so a paid extension can
// never collide with the physical delete. User picks one of these at
// upload time and can extend later, but never past the cap.
export const EXPIRY_DAY_OPTIONS = [3, 7, 15] as const
export const DEFAULT_EXPIRY_DAYS = 3
export const MAX_EXPIRY_DAYS_FROM_UPLOAD = 19

// Extension cost — half the normal per-GB rate per step (3→7, 7→15,
// 15→19), same flat-rate constant as everything else so there's only one
// number to reason about.
export const EXTENSION_RATE_PAISE_PER_GB = Math.round(FLAT_RATE_PAISE_PER_GB / 2)

export const MAX_FILE_SIZE_GB = 10

export const RATE_LIMIT_UPLOADS_PER_HOUR = 10

export const MULTIPART_CHUNK_SIZE_BYTES = 50 * 1024 * 1024  // 50MB chunks

export const WALLET_TOPUP_TIERS: WalletTopupTier[] = [
  {
    id: 'starter',
    label: 'Starter',
    pricePaise: 19900,
    bonusPaise: 0,
    popular: false,
    effectiveValuePaise: 19900,
  },
  {
    id: 'popular',
    label: 'Popular',
    pricePaise: 49900,
    bonusPaise: 5000,
    popular: true,
    effectiveValuePaise: 54900,
  },
  {
    id: 'pro',
    label: 'Pro',
    pricePaise: 99900,
    bonusPaise: 15000,
    popular: false,
    effectiveValuePaise: 114900,
  },
  {
    id: 'agency',
    label: 'Agency',
    pricePaise: 299900,
    bonusPaise: 60000,
    popular: false,
    effectiveValuePaise: 359900,
  },
]

// R2 storage-only cost estimate (no egress fee) — used for the internal
// margin display, never shown to end users.
export const ESTIMATED_AWS_COST_PER_GB_PAISE = 150   // ₹1.50/GB

export const RAZORPAY_FEE_PERCENT = 2
