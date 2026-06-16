import type { WalletTopupTier } from '@/types'

export const MINIMUM_CHARGE_PAISE = 1900

export const SMALL_FILE_THRESHOLD_BYTES = 500 * 1024 * 1024  // 500MB

export const PRICE_SLABS = [
  { maxGB: 0.5,  pricePerGBPaise: 0,    flatPaise: 1900 },  // 0–500MB: ₹19 flat
  { maxGB: 2,    pricePerGBPaise: 2900,  flatPaise: 0 },     // 500MB–2GB: ₹29/GB
  { maxGB: 5,    pricePerGBPaise: 2500,  flatPaise: 0 },     // 2GB–5GB: ₹25/GB
  { maxGB: 10,   pricePerGBPaise: 2200,  flatPaise: 0 },     // 5GB–10GB: ₹22/GB
] as const

export const COST_PER_DOWNLOAD_PAISE = 500   // ₹5 per slot

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
