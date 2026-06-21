import type { PriceBreakdown } from '@/types'
import {
  PRICE_SLABS,
  DOWNLOAD_SLOT_TIERS,
  SMALL_FILE_THRESHOLD_BYTES,
  ESTIMATED_AWS_COST_PER_GB_PAISE,
  RAZORPAY_FEE_PERCENT,
} from '@/constants/pricing'

function roundUpToTenthGB(gb: number): number {
  return Math.ceil(gb * 10) / 10
}

function bytesToGB(bytes: number): number {
  return bytes / (1024 * 1024 * 1024)
}

function getSlabLabel(fileSizeBytes: number, billableGB: number): string {
  if (fileSizeBytes <= SMALL_FILE_THRESHOLD_BYTES) return 'Free (≤500MB)'
  if (billableGB <= 2)  return '₹5/GB'
  if (billableGB <= 5)  return '₹4/GB'
  return '₹3/GB'
}

export function getDownloadSlotCostPaise(fileSizeBytes: number): number {
  const tier = DOWNLOAD_SLOT_TIERS.find((t) => fileSizeBytes <= t.maxBytes)
  return tier ? tier.costPaise : DOWNLOAD_SLOT_TIERS[DOWNLOAD_SLOT_TIERS.length - 1].costPaise
}

export function calculatePrice(fileSizeBytes: number, downloadSlots: number): PriceBreakdown {
  const rawGB = bytesToGB(fileSizeBytes)
  const billableGB = roundUpToTenthGB(rawGB)

  let storageCostPaise: number

  if (fileSizeBytes <= SMALL_FILE_THRESHOLD_BYTES) {
    storageCostPaise = 0
  } else {
    const slab = PRICE_SLABS.find((s) => billableGB <= s.maxGB)
    if (!slab) {
      storageCostPaise = Math.round(billableGB * PRICE_SLABS[PRICE_SLABS.length - 1].pricePerGBPaise)
    } else {
      storageCostPaise = Math.round(billableGB * slab.pricePerGBPaise)
    }
  }

  const slotCostPaise = getDownloadSlotCostPaise(fileSizeBytes)
  const downloadCostPaise = fileSizeBytes <= SMALL_FILE_THRESHOLD_BYTES
    ? 0
    : downloadSlots * slotCostPaise
  const totalPaise = storageCostPaise + downloadCostPaise

  const awsCostPaise = estimateAWSCost(fileSizeBytes, downloadSlots)
  const razorpayFeePaise = Math.round(totalPaise * (RAZORPAY_FEE_PERCENT / 100))
  const totalCostPaise = awsCostPaise + razorpayFeePaise
  const marginPercent =
    totalPaise > 0 ? Math.round(((totalPaise - totalCostPaise) / totalPaise) * 100) : 0

  return {
    billableGB,
    storageCostPaise,
    downloadSlots,
    downloadCostPaise,
    totalPaise,
    totalFormatted: formatPaise(totalPaise),
    slabApplied: getSlabLabel(fileSizeBytes, billableGB),
    marginPercent,
  }
}

export function formatPaise(paise: number): string {
  const rupees = paise / 100
  if (Number.isInteger(rupees)) return `₹${rupees}`
  return `₹${rupees.toFixed(2)}`
}

export function estimateAWSCost(fileSizeBytes: number, _downloadSlots: number): number {
  const gb = bytesToGB(fileSizeBytes)
  return Math.round(gb * ESTIMATED_AWS_COST_PER_GB_PAISE)
}
