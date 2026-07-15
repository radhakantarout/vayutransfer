'use client'

import { useEffect, useState } from 'react'
import StudioTopupModal from '@/components/studio/StudioTopupModal'
import { RETENTION_GRACE_DAY_OPTIONS } from '@/constants/studioPricing'

interface BillingStats {
  storageUsedBytes: number
  storageGrantBytes: number
  downloadUsedBytes: number
  downloadQuotaBytes: number
  aiSearchCreditsUsed: number
  aiSearchCreditsTotal: number
  dataRetentionGraceDays: number
}

function fmtBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function UsageCard({
  label, used, total, formatValue, onTopUp,
}: { label: string; used: number; total: number; formatValue: (n: number) => string; onTopUp: () => void }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0
  const over = used > total
  return (
    <div className={`bg-card border rounded-2xl px-5 py-4 space-y-2 ${over ? 'border-danger/30' : 'border-border'}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <button onClick={onTopUp} className="text-xs font-semibold text-accent hover:underline">Top up</button>
      </div>
      <div className="text-lg font-extrabold text-text-primary">
        {formatValue(used)} <span className="text-sm font-medium text-muted">/ {formatValue(total)}</span>
      </div>
      <div className="h-1.5 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${over ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [billing, setBilling] = useState<BillingStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [topupKind, setTopupKind] = useState<'storage' | 'download' | 'ai-search' | null>(null)

  const loadStats = () => {
    fetch('/studio/api/admin/stats')
      .then(r => r.json())
      .then(d => { if (d?.success) setBilling(d.data.billing ?? null) })
  }

  useEffect(() => {
    loadStats()
    setLoading(false)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-text-primary">Settings</h1>
        <p className="text-sm text-muted mt-0.5">Studio preferences</p>
      </div>

      {billing && (
        <div className="bg-card border border-border rounded-2xl px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-text-primary">Data retention grace period</p>
            <p className="text-xs text-muted mt-0.5">How long you get to top up before over-limit photos are auto-removed, oldest first.</p>
          </div>
          <select
            value={billing.dataRetentionGraceDays}
            onChange={async (e) => {
              const days = Number(e.target.value)
              setBilling((b) => b ? { ...b, dataRetentionGraceDays: days } : b)
              await fetch('/studio/api/admin/retention', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ days }),
              })
            }}
            className="bg-bg border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
          >
            {RETENTION_GRACE_DAY_OPTIONS.map((d) => (
              <option key={d} value={d}>{d} days</option>
            ))}
          </select>
        </div>
      )}

      <div id="billing" className="space-y-3 scroll-mt-6">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">Billing &amp; usage</h2>
        {billing && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <UsageCard
              label="Storage"
              used={billing.storageUsedBytes}
              total={billing.storageGrantBytes}
              formatValue={fmtBytes}
              onTopUp={() => setTopupKind('storage')}
            />
            <UsageCard
              label="Downloads This Month"
              used={billing.downloadUsedBytes}
              total={billing.downloadQuotaBytes}
              formatValue={fmtBytes}
              onTopUp={() => setTopupKind('download')}
            />
            <UsageCard
              label="AI Search Credits"
              used={billing.aiSearchCreditsUsed}
              total={billing.aiSearchCreditsTotal}
              formatValue={(n) => `${n}`}
              onTopUp={() => setTopupKind('ai-search')}
            />
          </div>
        )}
      </div>

      {topupKind && (
        <StudioTopupModal
          kind={topupKind}
          onClose={() => setTopupKind(null)}
          onSuccess={() => { setTopupKind(null); loadStats() }}
        />
      )}
    </div>
  )
}
