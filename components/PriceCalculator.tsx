'use client'

import { useEffect } from 'react'
import { calculatePrice, formatPaise } from '@/lib/pricing'
import type { PriceBreakdown } from '@/types'

interface Props {
  fileSizeBytes: number
  walletBalancePaise: number
  onPricingChange: (pricing: PriceBreakdown) => void
}

function formatGB(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024)
  return gb < 1 ? `${Math.round(gb * 1024)} MB` : `${gb.toFixed(1)} GB`
}

// Compact inline price strip — sits right above the upload button. Every
// transfer is charged, no free tier — this always shows a real ₹ amount,
// calculated precisely from the exact byte size.
export default function PriceCalculator({ fileSizeBytes, walletBalancePaise, onPricingChange }: Props) {
  const pricing = fileSizeBytes ? calculatePrice(fileSizeBytes) : null

  useEffect(() => {
    if (pricing) onPricingChange(pricing)
  }, [fileSizeBytes]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!pricing) return null

  const canAfford = walletBalancePaise >= pricing.totalPaise
  const shortfall = pricing.totalPaise - walletBalancePaise

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-xl px-4 py-3 border bg-bg border-border">
        <span className="text-sm text-muted">
          {formatGB(fileSizeBytes)} · You'll pay
        </span>
        <span className="font-bold text-lg text-text-primary">
          {pricing.totalFormatted}
        </span>
      </div>

      {!canAfford && (
        <div className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
          You're short by {formatPaise(shortfall)} — top up your wallet to continue
        </div>
      )}
    </div>
  )
}
