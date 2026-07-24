import type { StudioTransaction } from '@/types/studio'

// Single source of truth for how a transaction is described to a human —
// used by the receipt PDF, the payment-confirmation email, and the Billing
// history list, so the three can never drift out of sync (they used to:
// the PDF had its own stale copy that still referenced the removed
// download-topup model).
export function formatTxnLabel(txn: StudioTransaction): string {
  if (txn.type === 'storage_topup') return `${txn.gbPurchased} GB storage top-up`
  if (txn.type === 'ai_search_topup') return `${txn.creditsPurchased ?? 0} AI search top-up`
  if (txn.planId === 'free') return 'Free plan'
  return `Pro plan (${txn.gbPurchased} GB, ${txn.creditsPurchased ?? 0} AI searches/mo, ${txn.billingCycle ?? 'monthly'})`
}
