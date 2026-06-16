'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import TopupModal from '@/components/TopupModal'
import { formatPaise } from '@/lib/pricing'
import type { Transaction } from '@/types'

export default function WalletPage() {
  const [walletId, setWalletId] = useState<string | null>(null)
  const [balancePaise, setBalancePaise] = useState(0)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [showTopup, setShowTopup] = useState(false)

  useEffect(() => {
    fetch('/api/wallet/balance')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setWalletId(data.data.walletId)
          setBalancePaise(data.data.balancePaise)
          // Load transactions
          return fetch(`/api/wallet/transactions?walletId=${data.data.walletId}`)
        }
      })
      .then((r) => r?.json())
      .then((data) => {
        if (data?.success) setTransactions(data.data ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const typeLabel: Record<Transaction['type'], string> = {
    topup: 'Top-up',
    deduction: 'Upload',
    bonus: 'Bonus',
    refund: 'Refund',
  }

  const typeColor: Record<Transaction['type'], string> = {
    topup: 'text-success',
    deduction: 'text-danger',
    bonus: 'text-accent',
    refund: 'text-success',
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link href="/" className="text-muted hover:text-text-primary transition-colors text-sm">
            ← Back
          </Link>
          <span className="font-bold text-accent text-xl">VayuTransfer</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        {/* Balance card */}
        <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-4">
          <div className="text-muted text-sm">Current Balance</div>
          {loading ? (
            <div className="h-12 w-32 bg-border rounded animate-pulse mx-auto" />
          ) : (
            <div className="text-5xl font-bold text-text-primary">
              {formatPaise(balancePaise)}
            </div>
          )}
          <button
            onClick={() => setShowTopup(true)}
            className="px-6 py-3 bg-accent text-bg font-bold rounded-xl hover:bg-accent/90 transition-colors"
          >
            Add Credits
          </button>
        </div>

        {/* Transactions */}
        <div>
          <h2 className="font-semibold text-text-primary mb-4">Recent Transactions</h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-card border border-border rounded-xl animate-pulse" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center text-muted text-sm">
              No transactions yet. Top up your wallet to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((txn) => (
                <div
                  key={txn.txnId}
                  className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between"
                >
                  <div>
                    <div className="text-sm font-medium text-text-primary">
                      {typeLabel[txn.type]}
                      {txn.status === 'pending' && (
                        <span className="ml-2 text-xs text-muted bg-bg px-2 py-0.5 rounded">pending</span>
                      )}
                    </div>
                    <div className="text-xs text-muted">
                      {new Date(txn.createdAt).toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold ${typeColor[txn.type]}`}>
                      {txn.type === 'deduction' ? '−' : '+'}{formatPaise(txn.amount + txn.bonusAmount)}
                    </div>
                    {txn.bonusAmount > 0 && (
                      <div className="text-xs text-success">+{formatPaise(txn.bonusAmount)} bonus</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {showTopup && walletId && (
        <TopupModal
          walletId={walletId}
          onSuccess={(newBalance) => {
            setBalancePaise(newBalance)
            setShowTopup(false)
            // Reload transactions
            fetch('/api/wallet/balance').then(r => r.json()).then(d => {
              if (d.success) setBalancePaise(d.data.balancePaise)
            })
          }}
          onClose={() => setShowTopup(false)}
        />
      )}
    </div>
  )
}
