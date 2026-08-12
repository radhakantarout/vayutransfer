import type { PriceBreakdown } from '@/types'
import {
  FLAT_RATE_PAISE_PER_GB,
  EXTENSION_RATE_PAISE_PER_GB,
  ESTIMATED_AWS_COST_PER_GB_PAISE,
  RAZORPAY_FEE_PERCENT,
} from '@/constants/pricing'

function roundUpToTenthGB(gb: number): number {
  return Math.ceil(gb * 10) / 10
}

function bytesToGB(bytes: number): number {
  return bytes / (1024 * 1024 * 1024)
}

// Cost for one expiry-extension step (e.g. 3→7 days) — half the normal
// per-GB rate, scaled by the file's actual size.
export function getExtensionCostPaise(fileSizeBytes: number): number {
  const billableGB = roundUpToTenthGB(bytesToGB(fileSizeBytes))
  return Math.round(billableGB * EXTENSION_RATE_PAISE_PER_GB)
}

// Every transfer costs its exact size × the flat per-GB rate — no free
// tier, no monthly quota, no per-transfer cap. A new signup's ₹50 bonus is
// just ordinary wallet balance, spent down like any top-up.
export function calculatePrice(fileSizeBytes: number): PriceBreakdown {
  const billableGB = roundUpToTenthGB(bytesToGB(fileSizeBytes))
  const totalPaise = Math.round(billableGB * FLAT_RATE_PAISE_PER_GB)

  const awsCostPaise = estimateAWSCost(fileSizeBytes)
  const razorpayFeePaise = Math.round(totalPaise * (RAZORPAY_FEE_PERCENT / 100))
  const totalCostPaise = awsCostPaise + razorpayFeePaise
  const marginPercent =
    totalPaise > 0 ? Math.round(((totalPaise - totalCostPaise) / totalPaise) * 100) : 0

  return {
    billableGB,
    totalPaise,
    totalFormatted: formatPaise(totalPaise),
    marginPercent,
  }
}

export function formatPaise(paise: number): string {
  const rupees = paise / 100
  if (Number.isInteger(rupees)) return `₹${rupees}`
  return `₹${rupees.toFixed(2)}`
}

export function estimateAWSCost(fileSizeBytes: number): number {
  const gb = bytesToGB(fileSizeBytes)
  return Math.round(gb * ESTIMATED_AWS_COST_PER_GB_PAISE)
}
