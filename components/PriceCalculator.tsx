'use client'

import { useState, useEffect } from 'react'
import { calculatePrice, formatPaise, getDownloadSlotCostPaise } from '@/lib/pricing'
import { FREE_DOWNLOAD_THRESHOLD_BYTES, FREE_DOWNLOAD_EXTRA_SLOT_PAISE } from '@/constants/pricing'
import type { PriceBreakdown } from '@/types'

interface Props {
  fileSizeBytes: number
  walletBalancePaise: number
  onPricingChange: (pricing: PriceBreakdown) => void
}

export default function PriceCalculator({ fileSizeBytes, walletBalancePaise, onPricingChange }: Props) {
  const [downloadSlots, setDownloadSlots] = useState(1)
  const [pricing, setPricing] = useState<PriceBreakdown | null>(null)

  useEffect(() => {
    if (!fileSizeBytes) return
    const p = calculatePrice(fileSizeBytes, downloadSlots)
    setPricing(p)
    onPricingChange(p)
  }, [fileSizeBytes, downloadSlots, onPricingChange])

  if (!pricing) return null

  const canAfford = walletBalancePaise >= pricing.totalPaise
  const shortfall = pricing.totalPaise - walletBalancePaise

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-5">
      <h3 className="font-semibold text-text-primary">Price Breakdown</h3>

      {/* Download slots slider */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted">Download slots</span>
          <span className="text-text-primary font-medium">{downloadSlots}</span>
        </div>
        <input
          type="range"
          min={1}
          max={20}
          value={downloadSlots}
          onChange={(e) => setDownloadSlots(Number(e.target.value))}
          className="w-full h-2 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #00C6FF ${((downloadSlots - 1) / 19) * 100}%, #1E2D45 ${((downloadSlots - 1) / 19) * 100}%)`,
          }}
        />
        <div className="flex justify-between text-xs text-muted">
          <span>1</span>
          <span>20</span>
        </div>
      </div>

      {/* Breakdown lines */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">
            File size
          </span>
          <span className="text-text-primary">
            {pricing.billableGB < 1
              ? `${(pricing.billableGB * 1024).toFixed(0)} MB`
              : `${pricing.billableGB.toFixed(1)} GB`}
            {' '}(billed)
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-muted">
            Storage <span className="text-xs opacity-60">({pricing.slabApplied})</span>
          </span>
          <span className={pricing.storageCostPaise === 0 ? 'text-success font-semibold' : 'text-text-primary'}>
            {pricing.storageCostPaise === 0 ? 'Free' : formatPaise(pricing.storageCostPaise)}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-muted">
            {fileSizeBytes <= FREE_DOWNLOAD_THRESHOLD_BYTES
              ? downloadSlots === 1
                ? 'Downloads (1 slot)'
                : `Downloads (1 free + ${downloadSlots - 1} × ${formatPaise(FREE_DOWNLOAD_EXTRA_SLOT_PAISE)})`
              : `Downloads (${downloadSlots} × ${formatPaise(getDownloadSlotCostPaise(fileSizeBytes))})`}
          </span>
          <span className={pricing.downloadCostPaise === 0 ? 'text-success font-semibold' : 'text-text-primary'}>
            {pricing.downloadCostPaise === 0 ? 'Free' : formatPaise(pricing.downloadCostPaise)}
          </span>
        </div>

        <div className="border-t border-border pt-2 flex justify-between font-semibold text-base">
          <span className="text-text-primary">Total</span>
          <span className={canAfford ? 'text-success' : 'text-danger'}>
            {pricing.totalFormatted}
          </span>
        </div>
      </div>

      {/* Balance warning */}
      {!canAfford && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">
          Insufficient balance — add {formatPaise(shortfall)} more to proceed
        </div>
      )}

      {canAfford && (
        <div className="bg-success/10 border border-success/30 rounded-lg px-4 py-3 text-sm text-success">
          Balance sufficient · {formatPaise(walletBalancePaise - pricing.totalPaise)} remaining after upload
        </div>
      )}

    </div>
  )
}
