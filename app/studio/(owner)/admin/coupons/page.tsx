'use client'

import { useEffect, useState } from 'react'
import type { StudioCoupon } from '@/types/studio'

const INPUT_CLASS = 'w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-muted/60 focus:outline-none focus:border-accent/60 transition-colors'

interface FormState {
  code: string
  aiCredits: string
  storageGB: string
  maxRedemptions: string
  restrictToStudioId: string
  expiresAt: string
  note: string
}

const EMPTY_FORM: FormState = {
  code: '', aiCredits: '', storageGB: '', maxRedemptions: '1', restrictToStudioId: '', expiresAt: '', note: '',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function OwnerCouponsPage() {
  const [coupons, setCoupons] = useState<StudioCoupon[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [justCreated, setJustCreated] = useState<string | null>(null)
  const [busyCode, setBusyCode] = useState<string | null>(null)

  const load = () => {
    fetch('/studio/api/owner/coupons')
      .then((r) => r.json())
      .then((d) => { if (d.success) setCoupons(d.data); else setError('Could not load coupons.') })
      .catch(() => setError('Could not load coupons.'))
  }
  useEffect(() => { load() }, [])

  // Computed client-side purely for the admin's own awareness before they
  // hit Create — mirrors the real server-side caps exactly (see
  // lib/studio/coupons.ts) so there's no surprise after submission.
  const worstCaseAi = (Number(form.aiCredits) || 0) * (Number(form.maxRedemptions) || 0)
  const worstCaseStorage = (Number(form.storageGB) || 0) * (Number(form.maxRedemptions) || 0)

  const handleCreate = async () => {
    setCreating(true)
    setFormError(null)
    const res = await fetch('/studio/api/owner/coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: form.code.trim() || undefined,
        aiCredits: Number(form.aiCredits) || 0,
        storageGB: Number(form.storageGB) || 0,
        maxRedemptions: Number(form.maxRedemptions) || 1,
        restrictToStudioId: form.restrictToStudioId.trim() || undefined,
        expiresAt: form.expiresAt || undefined,
        note: form.note.trim() || undefined,
      }),
    }).then((r) => r.json()).catch(() => null)

    if (!res?.success) {
      setFormError(res?.message ?? 'Could not create coupon.')
      setCreating(false)
      return
    }
    setJustCreated(res.data.code)
    setForm(EMPTY_FORM)
    setShowForm(false)
    setCreating(false)
    load()
  }

  const toggleStatus = async (coupon: StudioCoupon) => {
    setBusyCode(coupon.code)
    const nextStatus = coupon.status === 'active' ? 'disabled' : 'active'
    await fetch(`/studio/api/owner/coupons/${encodeURIComponent(coupon.code)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    }).catch(() => {})
    setBusyCode(null)
    load()
  }

  const deleteCoupon = async (coupon: StudioCoupon) => {
    if (!window.confirm(`Delete coupon ${coupon.code}? This can't be undone.`)) return
    setBusyCode(coupon.code)
    const res = await fetch(`/studio/api/owner/coupons/${encodeURIComponent(coupon.code)}`, { method: 'DELETE' }).then((r) => r.json()).catch(() => null)
    if (!res?.success) window.alert(res?.message ?? 'Could not delete coupon.')
    setBusyCode(null)
    load()
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Coupons</h1>
          <p className="text-sm text-muted mt-1">
            Grant AI credits and/or storage by code — real studios redeem these themselves in Settings → Billing (or Moments' Plan &amp; Usage). No real money involved; every redemption is logged in billing history as a ₹0 transaction.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex-shrink-0 bg-accent text-bg text-sm font-bold px-4 py-2 rounded-xl hover:bg-accent/90 transition-colors"
        >
          {showForm ? 'Cancel' : '+ New coupon'}
        </button>
      </div>

      {error && <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-xl px-4 py-2.5">{error}</div>}
      {justCreated && (
        <div className="bg-success/10 border border-success/30 text-success text-sm rounded-xl px-4 py-2.5">
          Coupon <strong>{justCreated}</strong> created.
        </div>
      )}

      {showForm && (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-primary">Code</label>
              <input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="Leave blank to auto-generate"
                className={INPUT_CLASS}
              />
              <p className="text-[11px] text-muted">Blank = a random high-entropy code (recommended for one-off grants). Type your own only for intentionally-public/marketing codes.</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-primary">Max redemptions</label>
              <input type="number" min={1} value={form.maxRedemptions} onChange={(e) => setForm((f) => ({ ...f, maxRedemptions: e.target.value }))} className={INPUT_CLASS} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-primary">AI credits (per redemption)</label>
              <input type="number" min={0} value={form.aiCredits} onChange={(e) => setForm((f) => ({ ...f, aiCredits: e.target.value }))} className={INPUT_CLASS} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-primary">Storage GB (per redemption)</label>
              <input type="number" min={0} value={form.storageGB} onChange={(e) => setForm((f) => ({ ...f, storageGB: e.target.value }))} className={INPUT_CLASS} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-primary">Restrict to one studioId <span className="font-normal text-muted">(optional)</span></label>
              <input value={form.restrictToStudioId} onChange={(e) => setForm((f) => ({ ...f, restrictToStudioId: e.target.value }))} placeholder="Only this studio can redeem" className={INPUT_CLASS} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-primary">Expires <span className="font-normal text-muted">(optional)</span></label>
              <input type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} className={INPUT_CLASS} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-text-primary">Internal note <span className="font-normal text-muted">(not shown to redeemers)</span></label>
            <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="e.g. test account top-up, Diwali promo" className={INPUT_CLASS} />
          </div>

          {(worstCaseAi > 0 || worstCaseStorage > 0) && (
            <p className="text-[11px] text-muted bg-bg border border-border rounded-xl px-3 py-2">
              Worst-case total if fully redeemed: {worstCaseAi > 0 && <strong className="text-text-primary">{worstCaseAi.toLocaleString('en-IN')} AI credits</strong>}
              {worstCaseAi > 0 && worstCaseStorage > 0 && ' + '}
              {worstCaseStorage > 0 && <strong className="text-text-primary">{worstCaseStorage.toLocaleString('en-IN')} GB storage</strong>}
            </p>
          )}

          {formError && <p className="text-xs text-danger">{formError}</p>}

          <button
            onClick={handleCreate}
            disabled={creating || (!form.aiCredits && !form.storageGB)}
            className="w-full bg-accent text-bg text-sm font-bold py-2.5 rounded-xl hover:bg-accent/90 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create coupon'}
          </button>
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {coupons === null && !error && (
          <div className="px-4 py-10 flex justify-center"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
        )}
        {coupons?.length === 0 && <p className="px-4 py-10 text-sm text-muted text-center">No coupons yet.</p>}
        <div className="divide-y divide-border">
          {coupons?.map((c) => (
            <div key={c.code} className="px-4 py-3.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-bold text-text-primary">{c.code}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${c.status === 'active' ? 'bg-success/10 text-success' : 'bg-border text-muted'}`}>
                    {c.status === 'active' ? 'Active' : 'Disabled'}
                  </span>
                  {c.restrictToStudioId && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">1 studio only</span>
                  )}
                </div>
                <p className="text-[11px] text-muted mt-0.5">
                  {c.aiCredits > 0 && `${c.aiCredits.toLocaleString('en-IN')} AI credits`}
                  {c.aiCredits > 0 && c.storageGB > 0 && ' + '}
                  {c.storageGB > 0 && `${c.storageGB} GB storage`}
                  {' · '}{c.redeemedCount}/{c.maxRedemptions} redeemed
                  {c.expiresAt && ` · expires ${fmtDate(c.expiresAt)}`}
                </p>
                {c.note && <p className="text-[11px] text-muted italic mt-0.5 truncate">{c.note}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => toggleStatus(c)}
                  disabled={busyCode === c.code}
                  className="text-[11px] font-semibold text-accent hover:underline disabled:opacity-50"
                >
                  {c.status === 'active' ? 'Disable' : 'Enable'}
                </button>
                {c.redeemedCount === 0 && (
                  <button
                    onClick={() => deleteCoupon(c)}
                    disabled={busyCode === c.code}
                    className="text-[11px] font-semibold text-danger hover:underline disabled:opacity-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
