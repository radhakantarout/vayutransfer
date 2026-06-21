import { studioPutItem, studioGetItem, studioDeleteItem } from './dynamodb'

const OTP_TABLE = process.env.DYNAMO_STUDIO_AUDITLOG_TABLE
  ? 'vayustudio-otp'
  : 'vayustudio-otp'

// Stored in a lightweight in-memory map for local dev; DynamoDB for production
// In production, create a vayustudio-otp table (PK: sessionId, TTL: expiresAt)
const devStore = new Map<string, { otp: string; phone: string; projectToken: string; expiresAt: number }>()

const IS_DEV = process.env.NODE_ENV === 'development'

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function storeOTP(
  sessionId: string,
  otp: string,
  phone: string,
  projectToken: string
): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + 600 // 10 min TTL

  if (IS_DEV) {
    devStore.set(sessionId, { otp, phone, projectToken, expiresAt })
    return
  }

  await studioPutItem(OTP_TABLE, {
    sessionId,
    otp,
    phone,
    projectToken,
    expiresAt,
    createdAt: new Date().toISOString(),
  })
}

export async function verifyAndConsumeOTP(
  sessionId: string,
  submittedOtp: string
): Promise<{ phone: string; projectToken: string } | null> {
  const now = Math.floor(Date.now() / 1000)

  if (IS_DEV) {
    const record = devStore.get(sessionId)
    if (!record || record.expiresAt < now || record.otp !== submittedOtp) return null
    devStore.delete(sessionId)
    return { phone: record.phone, projectToken: record.projectToken }
  }

  const record = await studioGetItem<{
    otp: string; phone: string; projectToken: string; expiresAt: number
  }>(OTP_TABLE, { sessionId })

  if (!record || record.expiresAt < now || record.otp !== submittedOtp) return null

  await studioDeleteItem(OTP_TABLE, { sessionId })
  return { phone: record.phone, projectToken: record.projectToken }
}
