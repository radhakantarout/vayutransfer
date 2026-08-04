'use client'

import { useState } from 'react'
import {
  formatPaiseAsRupees, computeStorageAddOnPaise, computeAiAddOnPaise,
} from '@/constants/studioPricing'

interface Props {
  kind: 'storage' | 'ai-search'
  onSuccess: () => void
  onClose: () => void
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

// VayuStudios-only checkout flow — mirrors components/TopupModal.tsx's shape
// (dynamic script load → create order → open checkout → verify on success)
// but talks to the separate app/studio/api/billing/* routes, never the
// VayuTransfer wallet endpoints. Amount is a live slider (same +₹300/100GB,
// +₹300/1,000-photos rate as the Pro plan calculator) instead of a fixed
// package list — server always re-prices from the same shared constants,
// this UI is just for picking the amount.
export default function StudioTopupModal({ kind, onSuccess, onClose }: Props) {
  const [amount, setAmount] = useState(kind === 'storage' ? 100 : 1000)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const step = kind === 'storage' ? 50 : 500
  const max = kind === 'storage' ? 2000 : 20000
  const unitLabel = kind === 'storage' ? 'GB' : 'photos'
  const pricePaise = kind === 'storage' ? computeStorageAddOnPaise(amount) : computeAiAddOnPaise(amount)
  const orderEndpoint = kind === 'storage' ? '/studio/api/billing/storage-topup' : '/studio/api/billing/ai-search-topup'

  const handleConfirm = async () => {
    setError(null)
    setLoading(true)

    try {
      await loadRazorpay()

      const res = await fetch(orderEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'storage' ? { gb: amount } : { credits: amount }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message ?? 'Failed to create order')

      const { orderId, amountPaise, keyId, txnId } = data.data

      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: keyId,
          amount: amountPaise,
          currency: 'INR',
          order_id: orderId,
          name: 'VayuStudios',
          description: kind === 'storage' ? `${amount} GB storage top-up` : `${amount} AI search top-up`,
          theme: { color: '#00C6FF' },
          handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
            try {
              const verifyRes = await fetch('/studio/api/billing/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpayOrderId: response.razorpay_order_id,
                  razorpaySignature: response.razorpay_signature,
                  txnId,
                }),
              })
              const verifyData = await verifyRes.json()
              if (verifyData.success) {
                onSuccess()
                resolve()
              } else {
                reject(new Error(verifyData.message ?? 'Verification failed'))
              }
            } catch (err) {
              reject(err)
            }
          },
          modal: {
            ondismiss: () => reject(new Error('Payment cancelled')),
          },
        })
        rzp.open()
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      if (msg !== 'Payment cancelled') setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-bold text-text-primary">
            {kind === 'storage' ? 'Top up storage' : 'Top up AI search credits'}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-text-primary transition-colors text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-text-primary">Amount</span>
              <span className="font-bold text-accent">{amount.toLocaleString('en-IN')} {unitLabel}</span>
            </div>
            <input type="range" min={step} max={max} step={step} value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full h-1.5 rounded-full accent-accent cursor-pointer" />
            <div className="flex items-center justify-between text-[11px] text-muted">
              <span>{step} {unitLabel}</span>
              <span>{max.toLocaleString('en-IN')} {unitLabel}</span>
            </div>
          </div>

          <div className="bg-bg border border-border rounded-xl p-4 flex items-center justify-between">
            <span className="text-sm text-muted">Price</span>
            <span className="text-2xl font-extrabold text-text-primary">{formatPaiseAsRupees(pricePaise)}</span>
          </div>

          {kind === 'ai-search' && (
            <p className="text-[11px] text-muted">Applies to your current billing cycle only — unused top-up credits don&apos;t roll over to the next cycle.</p>
          )}

          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}

          <button onClick={handleConfirm} disabled={loading}
            className="w-full text-center text-sm font-bold py-3 rounded-xl bg-accent text-[#0B0F1A] hover:bg-accent/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
            {loading ? 'Processing…' : `Pay ${formatPaiseAsRupees(pricePaise)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
