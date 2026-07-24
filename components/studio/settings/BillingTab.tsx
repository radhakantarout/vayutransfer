'use client'

import { useEffect, useState } from 'react'
import {
  formatPaiseAsRupees, computeProPlanPricePaise,
  PRO_BASE_PRICE_PAISE, PRO_BASE_STORAGE_GB, PRO_BASE_AI_CREDITS,
  PRO_STORAGE_MAX_GB, PRO_STORAGE_STEP_GB, PRO_AI_MAX_CREDITS, PRO_AI_STEP_CREDITS,
  FREE_STORAGE_GB, FREE_AI_SEARCH_CREDITS, ANNUAL_MONTHS_CHARGED,
} from '@/constants/studioPricing'
import UsageBar, { usageTextColor } from '@/components/studio/UsageBar'
import StudioTopupModal from '@/components/studio/StudioTopupModal'

interface BillingStats {
  billingPlanId: 'free' | 'pro' | 'custom'
  planStorageGB: number
  planAiCreditsPerMonth: number
  billingCycle: 'monthly' | 'annual'
  planRenewsAt: string | null
  storageUsedBytes: number
  storageGrantBytes: number
  storageUsagePct: number
  aiSearchCreditsUsed: number
  aiSearchCreditsTotal: number
  aiSearchUsagePct: number
}

function fmtBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open(): void }
  }
}
function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window.Razorpay !== 'undefined') return resolve()
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Razorpay'))
    document.head.appendChild(script)
  })
}

export default function BillingTab() {
  const [billing, setBilling] = useState<BillingStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showChangePlan, setShowChangePlan] = useState(false)
  const [proStorageGB, setProStorageGB] = useState(PRO_BASE_STORAGE_GB)
  const [proAiCredits, setProAiCredits] = useState(PRO_BASE_AI_CREDITS)
  const [annual, setAnnual] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [topupKind, setTopupKind] = useState<'storage' | 'ai-search' | null>(null)

  const loadStats = () => {
    fetch('/studio/api/admin/stats').then(r => r.json()).then(res => {
      if (res.success) setBilling(res.data.billing)
    }).finally(() => setLoading(false))
  }
  useEffect(loadStats, [])

  const proMonthlyPaise = computeProPlanPricePaise(proStorageGB, proAiCredits)
  const proDisplayPaise = annual ? proMonthlyPaise * ANNUAL_MONTHS_CHARGED : proMonthlyPaise
  const proPerMonthPaise = Math.round(proDisplayPaise / (annual ? 12 : 1))

  const switchToFree = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/studio/api/billing/plan-change', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: 'free' }),
      }).then(r => r.json())
      if (!res.success) throw new Error(res.error ?? 'Failed to switch plan')
      setShowChangePlan(false)
      loadStats()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const switchToPro = async () => {
    setBusy(true); setError(null)
    try {
      await loadRazorpay()
      const res = await fetch('/studio/api/billing/plan-change', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: 'pro', storageGB: proStorageGB, aiCreditsPerMonth: proAiCredits, billingCycle: annual ? 'annual' : 'monthly' }),
      }).then(r => r.json())
      if (!res.success) throw new Error(res.error ?? 'Failed to create order')
      const { orderId, amountPaise, keyId, txnId } = res.data

      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: keyId, amount: amountPaise, currency: 'INR', order_id: orderId,
          name: 'VayuStudios',
          description: `Pro plan — ${proStorageGB} GB, ${proAiCredits} AI searches/mo`,
          theme: { color: '#00C6FF' },
          handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
            try {
              const verifyRes = await fetch('/studio/api/billing/verify', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpayOrderId: response.razorpay_order_id,
                  razorpaySignature: response.razorpay_signature,
                  txnId,
                }),
              })
              const verifyData = await verifyRes.json()
              if (verifyData.success) { resolve() } else { reject(new Error(verifyData.message ?? 'Verification failed')) }
            } catch (err) { reject(err) }
          },
          modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
        })
        rzp.open()
      })
      setShowChangePlan(false)
      loadStats()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      if (msg !== 'Payment cancelled') setError(msg)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-48"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
  }
  if (!billing) {
    return <p className="text-sm text-muted">Couldn&apos;t load billing information — try again shortly.</p>
  }

  const planName = billing.billingPlanId.charAt(0).toUpperCase() + billing.billingPlanId.slice(1)
  const isFree = billing.billingPlanId === 'free'

  return (
    <div className="max-w-3xl space-y-8">
      {/* Current plan */}
      <section className="space-y-3">
        <h4 className="text-xs font-bold text-muted uppercase tracking-wider">Current plan</h4>
        <div className="bg-gradient-to-br from-accent/10 to-transparent border border-accent/20 rounded-2xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-lg font-extrabold text-text-primary">{planName}</p>
              <span className="text-[10px] font-bold uppercase tracking-wide bg-accent/15 text-accent px-2 py-0.5 rounded-full">Active</span>
            </div>
            <p className="text-sm text-muted mt-0.5">
              {isFree ? 'Free' : `${formatPaiseAsRupees(billing.billingCycle === 'annual' ? Math.round(computeProPlanPricePaise(billing.planStorageGB, billing.planAiCreditsPerMonth) * ANNUAL_MONTHS_CHARGED / 12) : computeProPlanPricePaise(billing.planStorageGB, billing.planAiCreditsPerMonth))}/mo`}
              {billing.planRenewsAt && ` · renews ${fmtDate(billing.planRenewsAt)}`}
            </p>
          </div>
          <button onClick={() => setShowChangePlan(v => !v)}
            className="flex items-center gap-1.5 bg-accent text-bg text-xs font-bold px-4 py-2 rounded-xl hover:bg-accent/90 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
            </svg>
            {showChangePlan ? 'Hide plans' : 'Change plan'}
          </button>
        </div>

        {showChangePlan && (
          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-center gap-3">
              <span className={`text-xs font-semibold ${!annual ? 'text-text-primary' : 'text-muted'}`}>Monthly</span>
              <button type="button" onClick={() => setAnnual(v => !v)}
                className={`relative w-10 h-5 rounded-full transition-colors ${annual ? 'bg-accent' : 'bg-border'}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${annual ? 'translate-x-5' : ''}`} />
              </button>
              <span className={`text-xs font-semibold ${annual ? 'text-text-primary' : 'text-muted'}`}>Annual <span className="text-[10px] text-accent">(2 months free)</span></span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Free */}
              <div className={`rounded-2xl border p-4 space-y-3 ${isFree ? 'border-accent bg-accent/5' : 'border-border'}`}>
                <div>
                  <p className="text-sm font-bold text-text-primary">Free</p>
                  <p className="text-xl font-extrabold text-text-primary mt-1">₹0</p>
                </div>
                <ul className="text-xs text-muted space-y-1">
                  <li>{FREE_STORAGE_GB} GB storage</li>
                  <li>{FREE_AI_SEARCH_CREDITS} AI photo searches</li>
                </ul>
                <button disabled={isFree || busy} onClick={switchToFree}
                  className={`w-full py-2 rounded-xl text-xs font-bold transition-colors ${isFree ? 'bg-border/40 text-muted cursor-default' : 'bg-accent text-bg hover:bg-accent/90'}`}>
                  {isFree ? 'Current plan' : busy ? 'Switching…' : 'Switch to Free'}
                </button>
              </div>

              {/* Pro (dial-in) */}
              <div className="rounded-2xl border border-accent/40 bg-accent/5 p-4 space-y-3">
                <div>
                  <p className="text-sm font-bold text-text-primary">Pro</p>
                  <p className="text-xl font-extrabold text-text-primary mt-1">
                    {formatPaiseAsRupees(proPerMonthPaise)}<span className="text-xs font-medium text-muted">/mo</span>
                  </p>
                  <p className="text-[10px] text-muted">Starts at {formatPaiseAsRupees(PRO_BASE_PRICE_PAISE)}</p>
                </div>
                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted">Storage</span>
                      <span className="font-bold text-accent">{proStorageGB >= 1000 ? '1 TB' : `${proStorageGB} GB`}</span>
                    </div>
                    <input type="range" min={PRO_BASE_STORAGE_GB} max={PRO_STORAGE_MAX_GB} step={PRO_STORAGE_STEP_GB}
                      value={proStorageGB} onChange={e => setProStorageGB(Number(e.target.value))}
                      className="w-full h-1.5 rounded-full accent-accent cursor-pointer" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted">AI search / mo</span>
                      <span className="font-bold text-accent">{proAiCredits.toLocaleString('en-IN')}</span>
                    </div>
                    <input type="range" min={PRO_BASE_AI_CREDITS} max={PRO_AI_MAX_CREDITS} step={PRO_AI_STEP_CREDITS}
                      value={proAiCredits} onChange={e => setProAiCredits(Number(e.target.value))}
                      className="w-full h-1.5 rounded-full accent-accent cursor-pointer" />
                  </div>
                </div>
                <button disabled={busy} onClick={switchToPro}
                  className="w-full py-2 rounded-xl text-xs font-bold bg-accent text-bg hover:bg-accent/90 transition-colors disabled:opacity-60">
                  {busy ? 'Processing…' : billing.billingPlanId === 'pro' ? 'Update plan' : 'Switch to Pro'}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-muted text-center">
              Need more than 1 TB / 10,000 AI searches, or dedicated support? <a href="/studio/help" className="text-accent hover:underline">Talk to sales about Custom</a>.
            </p>

            {error && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">{error}</div>
            )}
          </div>
        )}
      </section>

      {/* Usage */}
      <section className="space-y-3">
        <h4 className="text-xs font-bold text-muted uppercase tracking-wider">Usage this cycle</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-2xl px-5 py-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted">Storage</span>
              <button onClick={() => setTopupKind('storage')} className="text-xs font-semibold text-accent hover:underline">Top up</button>
            </div>
            <p className="text-lg font-extrabold text-text-primary">
              {fmtBytes(billing.storageUsedBytes)} <span className="text-sm font-medium text-muted">/ {fmtBytes(billing.storageGrantBytes)}</span>
            </p>
            <UsageBar pct={billing.storageUsagePct} />
            <p className={`text-[11px] font-semibold ${usageTextColor(billing.storageUsagePct)}`}>{billing.storageUsagePct}% used</p>
          </div>
          <div className="bg-card border border-border rounded-2xl px-5 py-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted">AI photo search</span>
              <button onClick={() => setTopupKind('ai-search')} className="text-xs font-semibold text-accent hover:underline">Top up</button>
            </div>
            <p className="text-lg font-extrabold text-text-primary">
              {billing.aiSearchCreditsUsed.toLocaleString('en-IN')} <span className="text-sm font-medium text-muted">/ {billing.aiSearchCreditsTotal.toLocaleString('en-IN')}</span>
            </p>
            <UsageBar pct={billing.aiSearchUsagePct} />
            <p className={`text-[11px] font-semibold ${usageTextColor(billing.aiSearchUsagePct)}`}>{billing.aiSearchUsagePct}% used</p>
          </div>
        </div>
        <p className="text-[11px] text-muted">
          AI search credits reset every 30 days from your last plan change — unused top-up credits don&apos;t carry over to the next cycle. Storage top-ups never expire.
        </p>
      </section>

      {/* Billing history */}
      <section className="space-y-3">
        <h4 className="text-xs font-bold text-muted uppercase tracking-wider">Billing history</h4>
        <p className="text-xs text-muted">A PDF receipt is emailed to you automatically after every payment — check your inbox for past invoices.</p>
      </section>

      {topupKind && (
        <StudioTopupModal kind={topupKind} onClose={() => setTopupKind(null)} onSuccess={() => { setTopupKind(null); loadStats() }} />
      )}
    </div>
  )
}
