import { v4 as uuidv4 } from 'uuid'
import { getItem, putItem, updateItem } from '@/lib/aws/dynamodb'
import { getOrCreateWallet } from '@/lib/wallet'
import { logAudit } from '@/lib/audit'
import type { Transaction } from '@/types'

const USERS_TABLE = process.env.DYNAMO_USERS_TABLE ?? 'vayu-users'
const WALLETS_TABLE = process.env.DYNAMO_WALLETS_TABLE ?? 'vayu-wallets'
const TRANSACTIONS_TABLE = process.env.DYNAMO_TRANSACTIONS_TABLE ?? 'vayu-transactions'
const SIGNUP_BONUS_PAISE = parseInt(process.env.SIGNUP_BONUS_PAISE ?? '5000', 10)

export interface User {
  userId: string       // google_${sub}
  email: string
  name: string
  picture?: string
  walletId: string
  plan: 'free' | 'premium'
  bonusGiven: boolean
  createdAt: string
  updatedAt: string
}

export async function getOrCreateUser(profile: {
  id: string
  email: string
  name: string
  image?: string | null
}): Promise<User> {
  const userId = `google_${profile.id}`

  const existing = await getItem<User>(USERS_TABLE, { userId })
  if (existing) return existing

  // Create wallet — skip dev seed since the ₹50 signup bonus is credited below
  const wallet = await getOrCreateWallet(userId, true)

  const now = new Date().toISOString()
  const user: User = {
    userId,
    email: profile.email,
    name: profile.name,
    picture: profile.image ?? undefined,
    walletId: wallet.walletId,
    plan: 'free',
    bonusGiven: false,
    createdAt: now,
    updatedAt: now,
  }

  await putItem(USERS_TABLE, user)

  // Credit ₹50 signup bonus
  if (SIGNUP_BONUS_PAISE > 0) {
    await updateItem(
      WALLETS_TABLE,
      { walletId: wallet.walletId },
      'SET balance = balance + :bonus, totalLoaded = totalLoaded + :bonus, updatedAt = :now',
      { ':bonus': SIGNUP_BONUS_PAISE, ':now': now }
    )

    const bonusTxn: Transaction = {
      txnId: uuidv4(),
      walletId: wallet.walletId,
      type: 'bonus',
      amount: SIGNUP_BONUS_PAISE,
      bonusAmount: 0,
      status: 'success',
      createdAt: now,
    }
    await putItem(TRANSACTIONS_TABLE, bonusTxn)

    await updateItem(
      USERS_TABLE,
      { userId },
      'SET bonusGiven = :t, updatedAt = :now',
      { ':t': true, ':now': now }
    )
    user.bonusGiven = true
  }

  void logAudit({
    eventType: 'USER_CREATED',
    actor: 'user',
    outcome: 'success',
    walletId: wallet.walletId,
    amountPaise: SIGNUP_BONUS_PAISE,
    metadata: { userId, email: profile.email, bonusPaise: SIGNUP_BONUS_PAISE },
  })

  return user
}

export async function getUserById(userId: string): Promise<User | null> {
  return getItem<User>(USERS_TABLE, { userId })
}
