import { studioPutItem, studioGetItem, studioDeleteItem } from './dynamodb'

const OTP_TABLE = process.env.DYNAMO_STUDIO_OTP_TABLE ?? 'vayustudio-otp'

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function storeOTP(
  sessionId: string,
  otp: string,
  email: string,
  projectToken: string
): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + 600 // 10 min TTL
  await studioPutItem(OTP_TABLE, {
    sessionId,
    otp,
    email,
    projectToken,
    expiresAt,
    createdAt: new Date().toISOString(),
  })
}

export async function verifyAndConsumeOTP(
  sessionId: string,
  submittedOtp: string
): Promise<{ email: string; projectToken: string } | null> {
  const now = Math.floor(Date.now() / 1000)

  const record = await studioGetItem<{
    otp: string; email: string; projectToken: string; expiresAt: number
  }>(OTP_TABLE, { sessionId })

  if (!record || record.expiresAt < now || record.otp !== submittedOtp) return null

  await studioDeleteItem(OTP_TABLE, { sessionId })
  return { email: record.email, projectToken: record.projectToken }
}
