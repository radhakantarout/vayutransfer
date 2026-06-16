'use client'

import { useState } from 'react'
import { WALLET_TOPUP_TIERS } from '@/constants/pricing'
import { formatPaise } from '@/lib/pricing'

interface Props {
  walletId: string
  onSuccess: (newBalancePaise: number) => void
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

export default function TopupModal({ walletId, onSuccess, onClose }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSelect = async (tierId: string) => {
    setError(null)
    setLoading(tierId)

    try {
      await loadRazorpay()

      const res = await fetch('/api/wallet/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tierId, walletId }),
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
          name: 'VayuTransfer',
          description: 'Wallet top-up',
          theme: { color: '#00C6FF' },
          handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
            try {
              const verifyRes = await fetch('/api/wallet/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpayOrderId: response.razorpay_order_id,
                  razorpaySignature: response.razorpay_signature,
                  walletId,
                  tierId,
                  txnId,
                }),
              })
              const verifyData = await verifyRes.json()
              if (verifyData.success) {
                onSuccess(verifyData.data.newBalancePaise)
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
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-bold text-text-primary">Add Credits</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-text-primary transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Tiers */}
        <div className="p-6 space-y-3">
          {WALLET_TOPUP_TIERS.map((tier) => (
            <button
              key={tier.id}
              onClick={() => handleSelect(tier.id)}
              disabled={!!loading}
              className={`
                w-full text-left rounded-xl border p-4 transition-all
                ${tier.popular
                  ? 'border-accent bg-accent/5 hover:bg-accent/10'
                  : 'border-border bg-bg hover:border-accent/40'
                }
                ${loading === tier.id ? 'opacity-75' : ''}
                disabled:cursor-not-allowed
              `}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-text-primary">{tier.label}</span>
                  {tier.popular && (
                    <span className="text-xs bg-accent text-bg font-bold px-2 py-0.5 rounded-full">
                      Popular
                    </span>
                  )}
                </div>
                <span className="font-bold text-text-primary">
                  {loading === tier.id ? '...' : formatPaise(tier.pricePaise)}
                </span>
              </div>
              <div className="mt-1 text-sm text-muted flex items-center gap-1">
                <span>Get {formatPaise(tier.pricePaise)}</span>
                {tier.bonusPaise > 0 && (
                  <span className="text-success font-medium">
                    + {formatPaise(tier.bonusPaise)} bonus
                  </span>
                )}
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
