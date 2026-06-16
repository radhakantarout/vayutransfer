import type { PriceBreakdown } from '@/types'
import {
  PRICE_SLABS,
  COST_PER_DOWNLOAD_PAISE,
  MINIMUM_CHARGE_PAISE,
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

function getSlabLabel(billableGB: number): string {
  if (billableGB <= 0.5) return 'flat rate (≤500MB)'
  if (billableGB <= 2)   return '₹29/GB'
  if (billableGB <= 5)   return '₹25/GB'
  return '₹22/GB'
}

export function calculatePrice(fileSizeBytes: number, downloadSlots: number): PriceBreakdown {
  const rawGB = bytesToGB(fileSizeBytes)
  const billableGB = roundUpToTenthGB(rawGB)

  let storageCostPaise: number

  if (fileSizeBytes <= SMALL_FILE_THRESHOLD_BYTES) {
    storageCostPaise = MINIMUM_CHARGE_PAISE
  } else {
    const slab = PRICE_SLABS.find((s) => billableGB <= s.maxGB)
    if (!slab) {
      // exceeds 10GB — use highest slab
      storageCostPaise = Math.round(billableGB * PRICE_SLABS[PRICE_SLABS.length - 1].pricePerGBPaise)
    } else if (slab.flatPaise > 0) {
      storageCostPaise = slab.flatPaise
    } else {
      storageCostPaise = Math.round(billableGB * slab.pricePerGBPaise)
    }
    // Apply minimum floor
    if (storageCostPaise < MINIMUM_CHARGE_PAISE) {
      storageCostPaise = MINIMUM_CHARGE_PAISE
    }
  }

  const downloadCostPaise = downloadSlots * COST_PER_DOWNLOAD_PAISE
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
    slabApplied: getSlabLabel(billableGB),
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
