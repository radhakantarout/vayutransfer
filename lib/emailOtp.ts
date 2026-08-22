import { getItem, putItem, deleteItem, updateItem } from '@/lib/aws/dynamodb'

// VayuTransfer's own email-OTP store — modeled on VayuStudios'
// lib/studio/otp.ts as a read-only reference (6-digit code, TTL'd
// DynamoDB record) but a fully separate table/implementation, per the
// project's standing product-isolation rule. Keyed by email directly
// (not a random session id) since email itself is the identity being
// verified here — no extra context like a project token to bind.
const OTP_TABLE = process.env.DYNAMO_EMAIL_OTP_TABLE ?? 'vayu-email-otp'

const OTP_TTL_SECONDS = 10 * 60        // 10 minutes
const RESEND_COOLDOWN_SECONDS = 60      // prevents spam-clicking / email-bombing an inbox
const MAX_VERIFY_ATTEMPTS = 5           // brute-force guard on the 6-digit space

interface OtpRecord {
  email: string
  otp: string
  attempts: number
  lastSentAt: string
  expiresAt: number   // epoch seconds — DynamoDB TTL attribute
}

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function canRequestOtp(email: string): Promise<boolean> {
  const existing = await getItem<OtpRecord>(OTP_TABLE, { email })
  if (!existing) return true
  return Date.now() - new Date(existing.lastSentAt).getTime() >= RESEND_COOLDOWN_SECONDS * 1000
}

export async function storeOtp(email: string, otp: string): Promise<void> {
  const now = new Date()
  const record: OtpRecord = {
    email,
    otp,
    attempts: 0,
    lastSentAt: now.toISOString(),
    expiresAt: Math.floor(now.getTime() / 1000) + OTP_TTL_SECONDS,
  }
  await putItem(OTP_TABLE, record)
}

export type VerifyOtpResult = 'ok' | 'invalid' | 'expired' | 'too_many_attempts'

export async function verifyOtp(email: string, submitted: string): Promise<VerifyOtpResult> {
  const record = await getItem<OtpRecord>(OTP_TABLE, { email })
  if (!record) return 'expired'

  const nowSeconds = Math.floor(Date.now() / 1000)
  if (record.expiresAt < nowSeconds) {
    await deleteItem(OTP_TABLE, { email })
    return 'expired'
  }
  if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
    await deleteItem(OTP_TABLE, { email })
    return 'too_many_attempts'
  }

  if (record.otp !== submitted) {
    await updateItem(OTP_TABLE, { email }, 'SET attempts = attempts + :one', { ':one': 1 })
    return 'invalid'
  }

  // Single-use — consumed on success.
  await deleteItem(OTP_TABLE, { email })
  return 'ok'
}
