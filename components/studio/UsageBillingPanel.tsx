'use client'

import { useEffect, useState } from 'react'
import UsageBar, { usageTextColor } from '@/components/studio/UsageBar'
import StudioTopupModal from '@/components/studio/StudioTopupModal'
import { toMomentsCredits, formatBytesGB, formatPaiseAsRupees } from '@/constants/studioPricing'

// Shared between Studio Admin's Settings > Billing tab and Moments' Profile
// screen — same `role` discriminant pattern as PhotoLightbox.tsx. The usage
// NUMBERS are passed in as props (each parent keeps its own existing
// fetch — Studio Admin from /studio/api/admin/stats, Moments from
// /studio/api/auth/me) so this component owns only presentation + the one
// piece of data both roles now share unmodified: billing history, fetched
// internally from /studio/api/billing/history (role-agnostic at the
// DynamoDB layer, gated server-side by the isIndividual carve-out).
interface BillingHistoryRow {
  txnId: string
  type: string
  label: string
  amountPaise: number
  createdAt: string
}

interface UsageBillingPanelProps {
  role: 'studio' | 'moments'
  storageUsedBytes: number
  storageGrantBytes: number
  storageUsagePct: number
  aiCreditsUsed: number
  aiCreditsQuota: number
  aiUsagePct: number
  // Only meaningful for role === 'moments' — see constants/studioPricing.ts#toMomentsCredits.
  momentsCreditDivisor?: number
  // Called after a top-up succeeds so the parent can refetch its own usage
  // numbers (this panel only owns the history list's own refresh).
  onUsageChange?: () => void
  // A real (non-Moments) Free-plan studio can't top up at all — the backend
  // rejects it (billing/ai-search-topup's PLAN_REQUIRED) since there's no
  // paid base plan to top up ON TOP OF. Defaults to true (Moments' Free
  // plan CAN always top up via its own isIndividual carve-out). When false,
  // "Top up" calls onTopUpBlocked instead of opening the payment modal —
  // Studio Admin uses this to redirect to its upgrade-plan panel instead of
  // showing a payment dialog that would just fail server-side.
  topUpAllowed?: boolean
  onTopUpBlocked?: (kind: 'storage' | 'ai-search') => void
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function UsageBillingPanel({
  role, storageUsedBytes, storageGrantBytes, storageUsagePct,
  aiCreditsUsed, aiCreditsQuota, aiUsagePct, momentsCreditDivisor = 50, onUsageChange,
  topUpAllowed = true, onTopUpBlocked,
}: UsageBillingPanelProps) {
  const [history, setHistory] = useState<BillingHistoryRow[] | null>(null)
  const [historyError, setHistoryError] = useState(false)
  const [topupKind, setTopupKind] = useState<'storage' | 'ai-search' | null>(null)
  const [sendingReceipt, setSendingReceipt] = useState<string | null>(null)

  const handleTopUpClick = (kind: 'storage' | 'ai-search') => {
    if (!topUpAllowed) { onTopUpBlocked?.(kind); return }
    setTopupKind(kind)
  }

  const loadHistory = () => {
    fetch('/studio/api/billing/history')
      .then((r) => r.json())
      .then((d) => { if (d.success) setHistory(d.data); else setHistoryError(true) })
      .catch(() => setHistoryError(true))
  }
  useEffect(() => { loadHistory() }, [])

  const aiLabel = role === 'moments' ? 'Moments Credits' : 'AI photo search'
  const aiUsedDisplay = role === 'moments' ? toMomentsCredits(aiCreditsUsed, momentsCreditDivisor) : aiCreditsUsed
  const aiQuotaDisplay = role === 'moments' ? toMomentsCredits(aiCreditsQuota, momentsCreditDivisor) : aiCreditsQuota

  const emailReceipt = async (txnId: string) => {
    setSendingReceipt(txnId)
    await fetch(`/studio/api/billing/receipt/${txnId}`, { method: 'POST' }).catch(() => {})
    setSendingReceipt(null)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-2xl px-5 py-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted">Storage</span>
            <button onClick={() => handleTopUpClick('storage')} className="text-xs font-semibold text-accent hover:underline">Top up</button>
          </div>
          <p className="text-lg font-extrabold text-text-primary">
            {formatBytesGB(storageUsedBytes)} <span className="text-sm font-medium text-muted">/ {formatBytesGB(storageGrantBytes)}</span>
          </p>
          <UsageBar pct={storageUsagePct} />
          <p className={`text-[11px] font-semibold ${usageTextColor(storageUsagePct)}`}>{storageUsagePct}% used</p>
        </div>

        <div className="bg-card border border-border rounded-2xl px-5 py-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted">{aiLabel}</span>
            <button onClick={() => handleTopUpClick('ai-search')} className="text-xs font-semibold text-accent hover:underline">Top up</button>
          </div>
          <p className="text-lg font-extrabold text-text-primary">
            {aiUsedDisplay} <span className="text-sm font-medium text-muted">/ {aiQuotaDisplay}</span>
          </p>
          <UsageBar pct={aiUsagePct} />
          <p className={`text-[11px] font-semibold ${usageTextColor(aiUsagePct)}`}>{aiUsagePct}% used</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-xs font-bold text-muted uppercase tracking-wider">Billing history</h3>
        </div>
        <div className="divide-y divide-border">
          {historyError && <p className="px-4 py-6 text-sm text-danger text-center">Could not load billing history.</p>}
          {!historyError && history === null && (
            <div className="px-4 py-6 flex justify-center"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
          )}
          {!historyError && history?.length === 0 && <p className="px-4 py-6 text-sm text-muted text-center">No transactions yet.</p>}
          {history?.map((txn) => (
            <div key={txn.txnId} className="flex items-center gap-3 px-4 py-3">
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-text-primary truncate">{txn.label}</span>
                <span className="block text-[11px] text-muted">{fmtDate(txn.createdAt)}</span>
              </span>
              <span className="text-sm font-bold text-text-primary flex-shrink-0">{formatPaiseAsRupees(txn.amountPaise)}</span>
              <div className="flex items-center gap-2.5 flex-shrink-0">
                <a href={`/studio/api/billing/receipt/${txn.txnId}`} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-accent hover:underline">View</a>
                <a href={`/studio/api/billing/receipt/${txn.txnId}?download=1`} className="text-[11px] font-semibold text-accent hover:underline">Download</a>
                <button
                  onClick={() => emailReceipt(txn.txnId)}
                  disabled={sendingReceipt === txn.txnId}
                  className="text-[11px] font-semibold text-accent hover:underline disabled:opacity-50"
                >
                  {sendingReceipt === txn.txnId ? 'Sending…' : 'Email me'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {topupKind && (
        <StudioTopupModal
          kind={topupKind}
          onClose={() => setTopupKind(null)}
          onSuccess={() => { setTopupKind(null); loadHistory(); onUsageChange?.() }}
        />
      )}
    </div>
  )
}
