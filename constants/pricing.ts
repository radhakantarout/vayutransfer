import type { WalletTopupTier } from '@/types'

export const MINIMUM_CHARGE_PAISE = 0

export const SMALL_FILE_THRESHOLD_BYTES = 500 * 1024 * 1024  // 500MB

export const PRICE_SLABS = [
  { maxGB: 0.5,  pricePerGBPaise: 0,   flatPaise: 0 },       // 0–500MB: Free
  { maxGB: 2,    pricePerGBPaise: 500,  flatPaise: 0 },       // 500MB–2GB: ₹5/GB
  { maxGB: 5,    pricePerGBPaise: 400,  flatPaise: 0 },       // 2GB–5GB: ₹4/GB
  { maxGB: 10,   pricePerGBPaise: 300,  flatPaise: 0 },       // 5GB–10GB: ₹3/GB
] as const

export const FREE_DOWNLOAD_THRESHOLD_BYTES = 500 * 1024 * 1024  // all slots free below this
export const FREE_DOWNLOAD_EXTRA_SLOT_PAISE = 0                 // unused — kept for compat

// Download slot cost varies by file size
export const DOWNLOAD_SLOT_TIERS = [
  { maxBytes: 500 * 1024 * 1024,        costPaise: 0    },   // <500MB:      Free
  { maxBytes: 2 * 1024 * 1024 * 1024,   costPaise: 1400 },   // 500MB–2GB:   ₹14/slot
  { maxBytes: 5 * 1024 * 1024 * 1024,   costPaise: 4700 },   // 2GB–5GB:     ₹47/slot
  { maxBytes: 10 * 1024 * 1024 * 1024,  costPaise: 10100 },  // 5GB–10GB:    ₹101/slot
] as const

export const DEFAULT_EXPIRY_HOURS = 24

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

export const ESTIMATED_AWS_COST_PER_GB_PAISE = 1100   // ₹11/GB

export const RAZORPAY_FEE_PERCENT = 2
