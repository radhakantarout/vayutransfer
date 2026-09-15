'use client'

import { useEffect, useState } from 'react'
import type { PricingConfig } from '@/types/pricingConfig'

const INPUT_CLASS = 'w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-muted/60 focus:outline-none focus:border-accent/60 transition-colors'

interface FieldDef {
  key: keyof PricingConfig
  label: string
  hint: string
  suffix?: string
  step?: number
}

const GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: 'Free plan',
    fields: [
      { key: 'freeStorageGB', label: 'Free storage', hint: 'Included storage on the free plan.', suffix: 'GB' },
      { key: 'freeAiSearchCredits', label: 'Free AI credits', hint: 'Included AI-search credits on the free plan — this is also every Moments studio\'s starting balance.', suffix: 'credits' },
      { key: 'momentsRetentionDays', label: 'Moments retention window', hint: 'Days a free Moments gallery is kept before it becomes eligible for deletion.', suffix: 'days' },
    ],
  },
  {
    title: 'Storage & AI top-ups',
    fields: [
      { key: 'storageExtraPaisePer100GB', label: 'Storage add-on rate', hint: 'Price per 100GB of extra storage, on top of any plan.', suffix: 'paise/100GB' },
      { key: 'aiExtraPaisePer1000', label: 'AI credit add-on rate', hint: 'Price per 1,000 AI-search credits. Also sets the per-credit conversion Moments Reels use to spend from this same pool.', suffix: 'paise/1,000' },
    ],
  },
  {
    title: 'AI Reel generation (Kling)',
    fields: [
      { key: 'klingCostPaisePerAiSecond', label: 'Kling raw cost', hint: 'What Kling actually charges per AI-video-second at 1080p, no audio.', suffix: 'paise/sec' },
      { key: 'fixedOverheadPaisePerReel', label: 'Fixed overhead per reel', hint: 'Rekognition analysis + Lambda compute + R2 storage, per reel.', suffix: 'paise' },
      { key: 'targetMargin', label: 'Target margin', hint: 'Gross margin applied on top of raw cost to get the sell price.', step: 0.01 },
      { key: 'minMarginFloor', label: 'Minimum margin floor', hint: 'Hard floor — discounts/packs must never price below this.', step: 0.01 },
      { key: 'creditValuePaise', label: 'Reel-credit pack value', hint: 'Retail value of one reel credit — used by Client Gallery/Guest\'s separate reel-credit pool (not Moments, which uses the AI-credit rate above).', suffix: 'paise' },
    ],
  },
]

export default function OwnerPricingPage() {
  const [config, setConfig] = useState<PricingConfig | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    fetch('/studio/api/owner/pricing-config')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setConfig(d.data.config)
          const next: Record<string, string> = {}
          for (const [k, v] of Object.entries(d.data.config)) next[k] = String(v)
          setDraft(next)
        } else {
          setError('Could not load pricing config.')
        }
      })
      .catch(() => setError('Could not load pricing config.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    const patch: Record<string, number> = {}
    for (const group of GROUPS) {
      for (const f of group.fields) {
        const n = Number(draft[f.key])
        if (Number.isFinite(n)) patch[f.key] = n
      }
    }
    const res = await fetch('/studio/api/owner/pricing-config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then((r) => r.json()).catch(() => null)

    if (!res?.success) {
      setError(res?.message ?? 'Could not save — check your values and try again.')
      setSaving(false)
      return
    }
    setConfig(res.data)
    setSuccess('Saved — takes effect for new price calculations within about a minute (cache TTL).')
    setSaving(false)
  }

  if (loading) {
    return <div className="p-8 flex justify-center"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Pricing configuration</h1>
        <p className="text-sm text-muted mt-1">
          Every number here drives a live price calculation across VayuStudios and Moments — storage top-ups, AI-search top-ups, and AI Reel generation. Changing a value takes effect immediately, no deploy needed.
        </p>
      </div>

      {error && <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-xl px-4 py-2.5">{error}</div>}
      {success && <div className="bg-success/10 border border-success/30 text-success text-sm rounded-xl px-4 py-2.5">{success}</div>}

      {config && (
        <div className="space-y-6">
          {GROUPS.map((group) => (
            <div key={group.title} className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-bold text-text-primary">{group.title}</h2>
              <div className="space-y-4">
                {group.fields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <label className="flex items-baseline justify-between text-xs font-semibold text-text-primary">
                      {f.label}
                      {f.suffix && <span className="text-[10px] font-normal text-muted">{f.suffix}</span>}
                    </label>
                    <input
                      type="number"
                      step={f.step ?? 1}
                      value={draft[f.key] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                      className={INPUT_CLASS}
                    />
                    <p className="text-[11px] text-muted">{f.hint}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-accent text-bg text-sm font-bold py-3 rounded-xl hover:bg-accent/90 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save pricing config'}
          </button>
        </div>
      )}
    </div>
  )
}
