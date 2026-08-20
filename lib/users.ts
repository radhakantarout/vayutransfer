import { v4 as uuidv4 } from 'uuid'
import { createHash } from 'crypto'
import { getItem, putItem, updateItem, queryItems } from '@/lib/aws/dynamodb'
import { getOrCreateWallet } from '@/lib/wallet'
import { logAudit } from '@/lib/audit'
import { sendNewUserSignupNotificationEmail } from '@/lib/aws/ses'
import type { Transaction } from '@/types'

const USERS_TABLE = process.env.DYNAMO_USERS_TABLE ?? 'vayu-users'
const WALLETS_TABLE = process.env.DYNAMO_WALLETS_TABLE ?? 'vayu-wallets'
const TRANSACTIONS_TABLE = process.env.DYNAMO_TRANSACTIONS_TABLE ?? 'vayu-transactions'
const SIGNUP_BONUS_PAISE = parseInt(process.env.SIGNUP_BONUS_PAISE ?? '5000', 10)

export interface User {
  userId: string       // google_${sub} for Google sign-in, email_${hash} for email/OTP
  email: string
  name: string
  picture?: string
  walletId: string
  plan: 'free' | 'premium'
  bonusGiven: boolean
  // Platform-admin moderation state. Absent/'active' is the default for
  // every pre-existing user — only ever set by the admin block/warn/unblock
  // routes (app/api/admin/users/[userId]/*). 'blocked' is enforced at
  // sign-in (lib/auth.ts's signIn callback denies the session outright),
  // not per-route, so it's a full lockout rather than a partial restriction.
  status?: 'active' | 'warned' | 'blocked'
  warningCount?: number
  lastWarningAt?: string
  blockedAt?: string
  blockedReason?: string
  createdAt: string
  updatedAt: string
}

// Shared by every signup path (Google, email/OTP) so wallet creation, the
// ₹50 bonus, the USER_CREATED audit event, and the admin new-signup
// notification all happen exactly once, the same way, regardless of how
// someone signed up — no separate code path to keep in sync.
async function createNewUserRecord(params: {
  userId: string
  email: string
  name: string
  picture?: string
}): Promise<User> {
  const { userId, email, name, picture } = params

  // Skip dev seed since the ₹50 signup bonus is credited below
  const wallet = await getOrCreateWallet(userId, true)

  const now = new Date().toISOString()
  const user: User = {
    userId,
    email,
    name,
    picture,
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
    metadata: { userId, email, bonusPaise: SIGNUP_BONUS_PAISE },
  })

  const adminEmail = process.env.PLATFORM_ADMIN_EMAIL
  if (adminEmail) {
    sendNewUserSignupNotificationEmail(adminEmail, user.name, user.email, now)
      .catch((e) => console.error('[ses] new user signup notification failed', e))
  }

  return user
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

  return createNewUserRecord({
    userId,
    email: profile.email,
    name: profile.name,
    picture: profile.image ?? undefined,
  })
}

// Derives a nice-enough default name from an email's local-part since the
// email/OTP signup flow deliberately collects nothing but the address
// itself ("simple one email box") — e.g. "priya.sharma" -> "Priya Sharma".
function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ') || email
}

// Email/OTP signup+sign-in (lib/auth.ts's CredentialsProvider). Looks up
// by email FIRST via the email-index GSI — if this address already has an
// account (created via Google or a previous OTP signup), that same
// account is returned rather than creating a second one. Verifying the
// OTP is proof of owning the inbox, which is the standard bar for signing
// into whichever existing account uses that address.
// Used by the signup page (via /api/auth/otp/request) to warn "you already
// have an account, sign in instead" before sending a code — and by
// getOrCreateUserByEmail below to avoid ever creating a duplicate.
export async function findUserByEmail(email: string): Promise<User | null> {
  const normalized = email.trim().toLowerCase()
  const existing = await queryItems<User>(USERS_TABLE, 'email-index', 'email = :e', { ':e': normalized })
  return existing[0] ?? null
}

export async function getOrCreateUserByEmail(email: string): Promise<User> {
  const normalized = email.trim().toLowerCase()
  const existing = await findUserByEmail(normalized)
  if (existing) return existing

  const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 24)
  const userId = `email_${hash}`

  return createNewUserRecord({
    userId,
    email: normalized,
    name: nameFromEmail(normalized),
  })
}

export async function getUserById(userId: string): Promise<User | null> {
  return getItem<User>(USERS_TABLE, { userId })
}
