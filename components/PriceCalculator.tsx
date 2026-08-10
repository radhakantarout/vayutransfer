'use client'

import { useEffect } from 'react'
import { calculatePrice, formatPaise } from '@/lib/pricing'
import type { PriceBreakdown } from '@/types'

interface Props {
  fileSizeBytes: number
  walletBalancePaise: number
  freeQuotaUsedBytes: number
  onPricingChange: (pricing: PriceBreakdown) => void
}

function formatGB(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024)
  return gb < 1 ? `${Math.round(gb * 1024)} MB` : `${gb.toFixed(1)} GB`
}

// Compact inline price strip — sits right above the upload button instead
// of a dedicated "settings" panel, since the only thing left to communicate
// is a single number.
export default function PriceCalculator({ fileSizeBytes, walletBalancePaise, freeQuotaUsedBytes, onPricingChange }: Props) {
  const pricing = fileSizeBytes ? calculatePrice(fileSizeBytes, freeQuotaUsedBytes) : null

  useEffect(() => {
    if (pricing) onPricingChange(pricing)
  }, [fileSizeBytes, freeQuotaUsedBytes]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!pricing) return null

  const canAfford = pricing.isFree || walletBalancePaise >= pricing.totalPaise
  const shortfall = pricing.totalPaise - walletBalancePaise

  return (
    <div className="space-y-2">
      <div className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
        pricing.isFree ? 'bg-success/10 border-success/30' : 'bg-bg border-border'
      }`}>
        <span className="text-sm text-muted">
          {formatGB(fileSizeBytes)} · You'll pay
        </span>
        <span className={`font-bold text-lg ${pricing.isFree ? 'text-success' : 'text-text-primary'}`}>
          {pricing.totalFormatted}
        </span>
      </div>

      {!pricing.isFree && !canAfford && (
        <div className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
          You're short by {formatPaise(shortfall)} — top up your wallet to continue
        </div>
      )}
    </div>
  )
}
