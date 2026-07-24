'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatBytesGB } from '@/constants/studioPricing'
import UsageBar, { usageTextColor } from '@/components/studio/UsageBar'
import StudioTopupModal from '@/components/studio/StudioTopupModal'

interface EventUsage {
  projectId: string
  eventType: string
  storageBytes: number
  lastActivity: string
}
interface ClientUsage {
  clientName: string
  events: EventUsage[]
  totalBytes: number
}
interface BillingStats {
  billingPlanId: 'free' | 'pro' | 'custom'
  storageUsedBytes: number
  storageGrantBytes: number
  storageUsagePct: number
  aiSearchCreditsUsed: number
  aiSearchCreditsTotal: number
  aiSearchUsagePct: number
}

const EVENT_COLORS = ['bg-accent', 'bg-accent/70', 'bg-accent/45', 'bg-accent/25', 'bg-border']

// Real data — fetches /studio/api/admin/stats (overview totals) and
// /studio/api/admin/usage/by-client (real per-project storage, summed from
// MediaFile.sizeBytes on read since no per-project cache exists).
export default function UsageTab({ onRequestChangePlan }: { onRequestChangePlan: () => void }) {
  const [billing, setBilling] = useState<BillingStats | null>(null)
  const [clients, setClients] = useState<ClientUsage[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedName, setExpandedName] = useState<string | null>(null)
  const [topupKind, setTopupKind] = useState<'storage' | 'ai-search' | null>(null)

  const load = () => {
    Promise.all([
      fetch('/studio/api/admin/stats').then(r => r.json()),
      fetch('/studio/api/admin/usage/by-client').then(r => r.json()),
    ]).then(([statsRes, clientsRes]) => {
      if (statsRes.success) setBilling(statsRes.data.billing)
      if (clientsRes.success) setClients(clientsRes.data.clients)
    }).finally(() => setLoading(false))
  }
  useEffect(load, [])

  if (loading) {
    return <div className="flex items-center justify-center h-48"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
  }
  if (!billing) {
    return <p className="text-sm text-muted">Couldn&apos;t load usage information — try again shortly.</p>
  }

  // Top-ups only make sense once you're on a paid plan — a Free studio gets
  // sent to Billing's upgrade options instead of a real top-up purchase.
  const handleTopUpClick = (kind: 'storage' | 'ai-search') => {
    if (billing.billingPlanId === 'free') { onRequestChangePlan(); return }
    setTopupKind(kind)
  }

  return (
    <div className="max-w-3xl space-y-8 relative">
      {/* Overview */}
      <section className="space-y-3">
        <h4 className="text-xs font-bold text-muted uppercase tracking-wider">Storage overview</h4>
        <div className="bg-card border border-border rounded-2xl px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-text-primary">
              {formatBytesGB(billing.storageUsedBytes)} used of {formatBytesGB(billing.storageGrantBytes)}
            </span>
            <button onClick={() => handleTopUpClick('storage')} className="text-xs font-semibold text-accent hover:underline">Top up storage</button>
          </div>
          <UsageBar pct={billing.storageUsagePct} className="h-2" />
          <p className={`text-[11px] font-semibold ${usageTextColor(billing.storageUsagePct)}`}>{billing.storageUsagePct}% used</p>
        </div>

        <div className="bg-card border border-border rounded-2xl px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-text-primary">
              {billing.aiSearchCreditsUsed.toLocaleString('en-IN')} AI searches used of {billing.aiSearchCreditsTotal.toLocaleString('en-IN')} this cycle
            </span>
            <button onClick={() => handleTopUpClick('ai-search')} className="text-xs font-semibold text-accent hover:underline">Top up AI search</button>
          </div>
          <UsageBar pct={billing.aiSearchUsagePct} className="h-2" />
          <p className={`text-[11px] font-semibold ${usageTextColor(billing.aiSearchUsagePct)}`}>{billing.aiSearchUsagePct}% used</p>
        </div>
      </section>

      {/* Per-client breakdown */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider">Projects by storage used</h4>
          <span className="text-[11px] text-muted">Highest to lowest</span>
        </div>
        {clients.length === 0 ? (
          <p className="text-xs text-muted px-1">No projects yet.</p>
        ) : (
          <div className="border border-border rounded-2xl overflow-hidden">
            {clients.map((c, i) => {
              const expanded = expandedName === c.clientName
              return (
                <div key={c.clientName} className={`px-4 py-3 space-y-2 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-text-primary truncate">{c.clientName}</p>
                      <p className="text-[10px] text-muted">{c.events.length} event{c.events.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs font-bold text-text-primary">{formatBytesGB(c.totalBytes)}</span>
                      <button onClick={() => setExpandedName(expanded ? null : c.clientName)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline">
                        <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                        Details
                      </button>
                      <Link href="/studio/dashboard/projects" className="text-[11px] font-semibold text-muted hover:text-text-primary hover:underline">
                        Manage photos →
                      </Link>
                    </div>
                  </div>

                  {expanded && (
                    <div className="pt-1 pb-1 pl-0.5 space-y-2">
                      <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Storage by event</p>
                      <div className="h-2 rounded-full overflow-hidden flex bg-border">
                        {c.events.map((e, idx) => (
                          <div key={e.projectId} className={EVENT_COLORS[idx % EVENT_COLORS.length]}
                            style={{ width: `${c.totalBytes > 0 ? (e.storageBytes / c.totalBytes) * 100 : 0}%` }} />
                        ))}
                      </div>
                      <div className="space-y-1">
                        {c.events.map((e, idx) => (
                          <div key={e.projectId} className="flex items-center justify-between text-[11px]">
                            <span className="flex items-center gap-1.5 text-muted">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${EVENT_COLORS[idx % EVENT_COLORS.length]}`} />
                              {(e.eventType ?? '').replace(/_/g, ' ')}
                              <span className="text-muted/60">· {new Date(e.lastActivity).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            </span>
                            <span className="text-text-primary font-semibold flex-shrink-0">{formatBytesGB(e.storageBytes)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {topupKind && (
        <StudioTopupModal kind={topupKind} onClose={() => setTopupKind(null)} onSuccess={() => { setTopupKind(null); load() }} />
      )}
    </div>
  )
}
