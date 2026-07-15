import { randomUUID } from 'crypto'
import { studioGetItem, studioPutItem, studioUpdateItem, TABLES } from './dynamodb'
import { currentMonthKey } from './usage'
import { GB, STORAGE_TOPUP_PACKAGES, DOWNLOAD_TOPUP_PACKAGES, AI_SEARCH_TOPUP_PACKAGES, FREE_AI_SEARCH_CREDITS } from '@/constants/studioPricing'
import type { StudioTransaction, StudioTxnType } from '@/types/studio'

export function findStorageTopupPackage(packageId: string) {
  return STORAGE_TOPUP_PACKAGES.find((p) => p.id === packageId) ?? null
}

export function findDownloadTopupPackage(packageId: string) {
  return DOWNLOAD_TOPUP_PACKAGES.find((p) => p.id === packageId) ?? null
}

export function findAiSearchTopupPackage(packageId: string) {
  return AI_SEARCH_TOPUP_PACKAGES.find((p) => p.id === packageId) ?? null
}

// Idempotent — mirrors lib/wallet.ts#creditWallet's proven txnId-status-check
// pattern exactly, on VayuStudios' own separate transactions table. Safe to
// call twice for the same txnId (client verify + webhook backup both call this).
export async function applyTopup(
  studioId: string,
  txnId: string,
  type: StudioTxnType,
  packageId: string,
  razorpayOrderId: string,
  razorpayPaymentId: string
): Promise<void> {
  const existing = await studioGetItem<StudioTransaction>(TABLES.transactions, { txnId })
  if (existing?.status === 'success') return

  const now = new Date().toISOString()

  if (type === 'storage_topup') {
    const pkg = findStorageTopupPackage(packageId)
    if (!pkg) throw new Error('INVALID_PACKAGE')

    const grant = {
      id: randomUUID(),
      bytes: pkg.gb * GB,
      expiresAt: new Date(Date.now() + pkg.months * 30 * 24 * 60 * 60 * 1000).toISOString(),
      source: 'topup' as const,
      purchasedTxnId: txnId,
      createdAt: now,
    }
    // Append to the grants list and clear any overage countdown — a fresh
    // top-up may bring the studio back under quota.
    await studioUpdateItem(
      TABLES.studios,
      { studioId },
      'SET storageGrants = list_append(if_not_exists(storageGrants, :empty), :grant), updatedAt = :now REMOVE storageOverageStartedAt, storageReminderCount',
      { ':grant': [grant], ':empty': [], ':now': now }
    )

    const txn: StudioTransaction = {
      txnId, studioId, type, packageId,
      amountPaise: pkg.pricePaise, gbPurchased: pkg.gb, months: pkg.months,
      razorpayOrderId, razorpayPaymentId, status: 'success', createdAt: now,
    }
    await studioPutItem(TABLES.transactions, txn as unknown as Record<string, unknown>)
    return
  }

  if (type === 'ai_search_topup') {
    const pkg = findAiSearchTopupPackage(packageId)
    if (!pkg) throw new Error('INVALID_PACKAGE')

    // Cumulative total, never decrements — mirrors storageUsedBytes' shape.
    // Studios created before this field existed start from the free
    // baseline rather than 0, via if_not_exists.
    await studioUpdateItem(
      TABLES.studios,
      { studioId },
      'SET aiSearchCreditsTotal = if_not_exists(aiSearchCreditsTotal, :free) + :credits, updatedAt = :now',
      { ':free': FREE_AI_SEARCH_CREDITS, ':credits': pkg.credits, ':now': now }
    )

    const txn: StudioTransaction = {
      txnId, studioId, type, packageId,
      amountPaise: pkg.pricePaise, gbPurchased: 0, creditsPurchased: pkg.credits,
      razorpayOrderId, razorpayPaymentId, status: 'success', createdAt: now,
    }
    await studioPutItem(TABLES.transactions, txn as unknown as Record<string, unknown>)
    return
  }

  // download_topup
  const pkg = findDownloadTopupPackage(packageId)
  if (!pkg) throw new Error('INVALID_PACKAGE')

  const month = currentMonthKey()
  await studioUpdateItem(
    TABLES.usage,
    { studioId, month },
    'ADD downloadTopupBytes :b SET updatedAt = :now',
    { ':b': pkg.gb * GB, ':now': now }
  )

  const txn: StudioTransaction = {
    txnId, studioId, type, packageId,
    amountPaise: pkg.pricePaise, gbPurchased: pkg.gb,
    razorpayOrderId, razorpayPaymentId, status: 'success', createdAt: now,
  }
  await studioPutItem(TABLES.transactions, txn as unknown as Record<string, unknown>)
}
