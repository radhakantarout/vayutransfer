'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatPaise } from '@/lib/pricing'

interface Props {
  onTopup: () => void
  onWalletLoaded?: (walletId: string, balancePaise: number) => void
}

export default function WalletCard({ onTopup, onWalletLoaded }: Props) {
  const [balancePaise, setBalancePaise] = useState<number | null>(null)
  const [walletId, setWalletId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch('/api/wallet/balance')
      const json = await res.json()
      if (json.success) {
        setBalancePaise(json.data.balancePaise)
        setWalletId(json.data.walletId)
        onWalletLoaded?.(json.data.walletId, json.data.balancePaise)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [onWalletLoaded])

  useEffect(() => {
    fetchBalance()
    const interval = setInterval(fetchBalance, 30_000)
    return () => clearInterval(interval)
  }, [fetchBalance])

  const isLow = balancePaise !== null && balancePaise < 5000  // < ₹50

  return (
    <div className={`
      bg-card border rounded-xl px-4 py-3 flex items-center gap-3
      ${isLow ? 'border-danger/40' : 'border-border'}
    `}>
      <div className="text-2xl">💳</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted">Wallet balance</div>
        {loading ? (
          <div className="h-5 w-20 bg-border rounded animate-pulse mt-0.5" />
        ) : (
          <div className={`font-bold text-lg leading-tight ${isLow ? 'text-danger' : 'text-text-primary'}`}>
            {balancePaise !== null ? formatPaise(balancePaise) : '—'}
          </div>
        )}
        {isLow && !loading && (
          <div className="text-danger text-xs mt-0.5">Low balance</div>
        )}
      </div>
      <button
        onClick={onTopup}
        className="px-3 py-1.5 bg-accent text-bg text-sm font-semibold rounded-lg hover:bg-accent/90 transition-colors whitespace-nowrap"
      >
        Add credits
      </button>
    </div>
  )
}
