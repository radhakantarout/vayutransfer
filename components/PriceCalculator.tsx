'use client'

import { useState, useEffect } from 'react'
import { calculatePrice, formatPaise, getDownloadSlotCostPaise } from '@/lib/pricing'
import { SMALL_FILE_THRESHOLD_BYTES } from '@/constants/pricing'
import type { PriceBreakdown } from '@/types'

interface Props {
  fileSizeBytes: number
  walletBalancePaise: number
  onPricingChange: (pricing: PriceBreakdown) => void
}

export default function PriceCalculator({ fileSizeBytes, walletBalancePaise, onPricingChange }: Props) {
  const isFree = fileSizeBytes > 0 && fileSizeBytes <= SMALL_FILE_THRESHOLD_BYTES
  const [downloadSlots, setDownloadSlots] = useState(1)
  const [pricing, setPricing] = useState<PriceBreakdown | null>(null)

  // Default to 10 slots for free (<500MB) transfers
  useEffect(() => {
    if (isFree) setDownloadSlots(10)
    else setDownloadSlots(1)
  }, [isFree])

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
      <h3 className="font-semibold text-text-primary">
        {isFree ? 'Transfer Settings' : 'Price Breakdown'}
      </h3>

      {/* Max downloads slider */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted">How many people can download?</span>
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

      {isFree ? (
        /* Free transfer — no breakdown, just the banner */
        <div className="bg-success/10 border border-success/30 rounded-lg px-4 py-3 text-sm text-success font-semibold text-center">
          This transfer is completely free — storage &amp; {downloadSlots} downloads included
        </div>
      ) : (
        <>
          {/* Breakdown lines */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">File size</span>
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
              <span className="text-text-primary">
                {formatPaise(pricing.storageCostPaise)}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-muted">
                {`${downloadSlots} downloads × ${formatPaise(getDownloadSlotCostPaise(fileSizeBytes))}`}
              </span>
              <span className="text-text-primary">
                {formatPaise(pricing.downloadCostPaise)}
              </span>
            </div>

            <div className="border-t border-border pt-2 flex justify-between font-semibold text-base">
              <span className="text-text-primary">Total</span>
              <span className={canAfford ? 'text-success' : 'text-danger'}>
                {pricing.totalFormatted}
              </span>
            </div>
          </div>

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
        </>
      )}
    </div>
  )
}
