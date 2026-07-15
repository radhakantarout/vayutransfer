'use client'

import { useState } from 'react'
import {
  STORAGE_TOPUP_PACKAGES, DOWNLOAD_TOPUP_PACKAGES, AI_SEARCH_TOPUP_PACKAGES,
  formatPaiseAsRupees,
} from '@/constants/studioPricing'

interface Props {
  kind: 'storage' | 'download' | 'ai-search'
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
// VayuTransfer wallet endpoints.
export default function StudioTopupModal({ kind, onSuccess, onClose }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const packages = kind === 'storage' ? STORAGE_TOPUP_PACKAGES : kind === 'ai-search' ? AI_SEARCH_TOPUP_PACKAGES : DOWNLOAD_TOPUP_PACKAGES
  const orderEndpoint = kind === 'storage' ? '/studio/api/billing/storage-topup' : kind === 'ai-search' ? '/studio/api/billing/ai-search-topup' : '/studio/api/billing/download-topup'
  const txnType = kind === 'storage' ? 'storage_topup' : kind === 'ai-search' ? 'ai_search_topup' : 'download_topup'

  const handleSelect = async (packageId: string) => {
    setError(null)
    setLoading(packageId)

    try {
      await loadRazorpay()

      const res = await fetch(orderEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId }),
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
          description: kind === 'storage' ? 'Storage top-up' : kind === 'ai-search' ? 'AI search credits top-up' : 'Download top-up',
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
                  type: txnType,
                  packageId,
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
      setLoading(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-bold text-text-primary">
            {kind === 'storage' ? 'Top up storage' : kind === 'ai-search' ? 'Top up AI search credits' : 'Top up downloads'}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-text-primary transition-colors text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-3">
          {packages.map((pkg) => (
            <button
              key={pkg.id}
              onClick={() => handleSelect(pkg.id)}
              disabled={!!loading}
              className={`w-full text-left rounded-xl border p-4 transition-all disabled:cursor-not-allowed
                ${pkg.popular ? 'border-accent bg-accent/5 hover:bg-accent/10' : 'border-border bg-bg hover:border-accent/40'}
                ${loading === pkg.id ? 'opacity-75' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-text-primary">{pkg.label}</span>
                  {pkg.popular && (
                    <span className="text-xs bg-accent text-bg font-bold px-2 py-0.5 rounded-full">Popular</span>
                  )}
                </div>
                <span className="font-bold text-text-primary">
                  {loading === pkg.id ? '...' : formatPaiseAsRupees(pkg.pricePaise)}
                </span>
              </div>
            </button>
          ))}

          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
