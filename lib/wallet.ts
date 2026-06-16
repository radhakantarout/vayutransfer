import { v4 as uuidv4 } from 'uuid'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import { getItem, putItem, updateItem, queryItems } from '@/lib/aws/dynamodb'
import { logAudit } from '@/lib/audit'
import type { Wallet, Transaction } from '@/types'

const WALLETS_TABLE = process.env.DYNAMO_WALLETS_TABLE ?? 'vayu-wallets'
const TRANSACTIONS_TABLE = process.env.DYNAMO_TRANSACTIONS_TABLE ?? 'vayu-transactions'

export async function getOrCreateWallet(sessionId: string): Promise<Wallet> {
  // Check if wallet exists for this session
  const existing = await queryItems<Wallet>(
    WALLETS_TABLE,
    'sessionId-index',
    'sessionId = :s',
    { ':s': sessionId }
  )

  if (existing.length > 0) return existing[0]

  // Create new wallet
  const now = new Date().toISOString()
  // In dev mode, seed with ₹500 test credits so uploads work without Razorpay
  const devSeedBalance =
    process.env.NODE_ENV !== 'production' && process.env.DEV_SEED_WALLET === 'true'
      ? 50000  // ₹500 in paise
      : 0

  const wallet: Wallet = {
    walletId: uuidv4(),
    sessionId,
    balance: devSeedBalance,
    totalLoaded: devSeedBalance,
    totalSpent: 0,
    createdAt: now,
    updatedAt: now,
  }

  await putItem(WALLETS_TABLE, wallet)

  void logAudit({
    eventType: 'WALLET_CREATED',
    actor: 'system',
    outcome: 'success',
    walletId: wallet.walletId,
    metadata: { sessionId, devSeedBalancePaise: devSeedBalance },
  })

  return wallet
}

export async function getWalletBalance(walletId: string): Promise<number> {
  const wallet = await getItem<Wallet>(WALLETS_TABLE, { walletId })
  if (!wallet) throw new Error('WALLET_NOT_FOUND')
  return wallet.balance
}

export async function deductFromWallet(
  walletId: string,
  amountPaise: number,
  fileId: string
): Promise<void> {
  const before = await getWalletBalance(walletId)

  try {
    await updateItem(
      WALLETS_TABLE,
      { walletId },
      'SET balance = balance - :amount, totalSpent = totalSpent + :amount, updatedAt = :now',
      {
        ':amount': amountPaise,
        ':now': new Date().toISOString(),
        ':minAmount': amountPaise,
      },
      'balance >= :minAmount'
    )
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      throw new Error('INSUFFICIENT_BALANCE')
    }
    throw err
  }

  const txnId = uuidv4()
  const txn: Transaction = {
    txnId,
    walletId,
    type: 'deduction',
    amount: amountPaise,
    bonusAmount: 0,
    fileId,
    status: 'success',
    createdAt: new Date().toISOString(),
  }
  await putItem(TRANSACTIONS_TABLE, txn)

  void logAudit({
    eventType: 'WALLET_DEDUCTED',
    actor: 'system',
    outcome: 'success',
    walletId,
    fileId,
    amountPaise,
    metadata: {
      balanceBeforePaise: before,
      balanceAfterPaise: before - amountPaise,
    },
  })
}

export async function creditWallet(
  walletId: string,
  amountPaise: number,
  bonusPaise: number,
  txnId: string
): Promise<void> {
  // Idempotency check — if txnId already processed, skip
  const existingTxn = await getItem<Transaction>(TRANSACTIONS_TABLE, { txnId })
  if (existingTxn?.status === 'success') return

  const totalCredit = amountPaise + bonusPaise

  await updateItem(
    WALLETS_TABLE,
    { walletId },
    'SET balance = balance + :credit, totalLoaded = totalLoaded + :credit, updatedAt = :now',
    {
      ':credit': totalCredit,
      ':now': new Date().toISOString(),
    }
  )

  const txn: Transaction = {
    txnId,
    walletId,
    type: 'topup',
    amount: amountPaise,
    bonusAmount: bonusPaise,
    status: 'success',
    createdAt: new Date().toISOString(),
  }
  await putItem(TRANSACTIONS_TABLE, txn)

  const newBalance = await getWalletBalance(walletId)

  void logAudit({
    eventType: 'WALLET_TOPUP_SUCCESS',
    actor: 'razorpay',
    outcome: 'success',
    walletId,
    txnId,
    amountPaise: totalCredit,
    metadata: {
      baseAmountPaise: amountPaise,
      bonusAmountPaise: bonusPaise,
      totalCreditedPaise: totalCredit,
      newBalancePaise: newBalance,
    },
  })
}

export async function refundWallet(
  walletId: string,
  amountPaise: number,
  fileId: string
): Promise<void> {
  await updateItem(
    WALLETS_TABLE,
    { walletId },
    'SET balance = balance + :amount, totalSpent = totalSpent - :amount, updatedAt = :now',
    {
      ':amount': amountPaise,
      ':now': new Date().toISOString(),
    }
  )

  const txnId = uuidv4()
  const txn: Transaction = {
    txnId,
    walletId,
    type: 'refund',
    amount: amountPaise,
    bonusAmount: 0,
    fileId,
    status: 'success',
    createdAt: new Date().toISOString(),
  }
  await putItem(TRANSACTIONS_TABLE, txn)

  void logAudit({
    eventType: 'WALLET_REFUNDED',
    actor: 'system',
    outcome: 'success',
    walletId,
    fileId,
    amountPaise,
  })
}
