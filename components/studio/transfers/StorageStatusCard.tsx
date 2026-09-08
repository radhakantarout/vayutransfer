'use client'

// VayuStudios' equivalent of VayuTransfer's WalletCard.tsx — same shell
// (icon + label + big value + low-state color swap), but shows storage-quota
// usage instead of a ₹ wallet balance, since Raw Transfer bills against the
// studio's own VayuStudios plan rather than a separate wallet. Reuses the
// stats already exposed by GET /studio/api/admin/stats — no new backend.

import { useEffect, useState } from 'react'

interface StorageBilling {
  storageUsedBytes: number
  storageGrantBytes: number
  storageUsagePct: number
  storageOverQuota: boolean
}

const GB = 1024 * 1024 * 1024

export default function StorageStatusCard() {
  const [billing, setBilling] = useState<StorageBilling | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/studio/api/admin/stats').then(r => r.json()).then(res => {
      if (res.success) setBilling(res.data.billing)
    }).finally(() => setLoading(false))
  }, [])

  const isHigh = !!billing && (billing.storageOverQuota || billing.storageUsagePct >= 90)
  const usedGB = billing ? billing.storageUsedBytes / GB : 0
  const totalGB = billing ? billing.storageGrantBytes / GB : 0

  return (
    <div className={`bg-card border rounded-2xl px-4 py-3.5 space-y-3 ${isHigh ? 'border-danger/40' : 'border-border'}`}>
      <div className="flex items-center gap-3">
        <div className="text-2xl">🗂️</div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted">Storage used</div>
          {loading ? (
            <div className="h-5 w-28 bg-border rounded animate-pulse mt-0.5" />
          ) : (
            <div className={`font-bold text-lg leading-tight ${isHigh ? 'text-danger' : 'text-text-primary'}`}>
              {usedGB.toFixed(1)} GB <span className="text-muted font-medium text-sm">of {totalGB.toFixed(0)} GB</span>
            </div>
          )}
          {isHigh && !loading && (
            <div className="text-danger text-xs mt-0.5">{billing?.storageOverQuota ? 'Over quota' : 'Almost full'}</div>
          )}
        </div>
      </div>
      {!loading && billing && (
        <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${isHigh ? 'bg-danger' : 'bg-accent'}`}
            style={{ width: `${Math.min(billing.storageUsagePct, 100)}%` }}
          />
        </div>
      )}
      <p className="text-[11px] text-muted leading-relaxed">
        Raw Transfer storage counts toward your VayuStudios plan — no extra charges.
      </p>
    </div>
  )
}
