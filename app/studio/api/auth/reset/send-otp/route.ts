import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { createHmac, randomInt } from 'crypto'
import { studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import type { StudioUser } from '@/types/studio'

const ses = new SESClient({
  region: process.env.SES_REGION ?? 'ap-south-1',
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
      : undefined,
})

function getSecret() {
  const s = process.env.STUDIO_JWT_SECRET
  if (!s) throw new Error('STUDIO_JWT_SECRET not set')
  return new TextEncoder().encode(s)
}

function otpHmac(otp: string, email: string): string {
  return createHmac('sha256', process.env.STUDIO_JWT_SECRET ?? 'fallback')
    .update(`${otp}:${email}`)
    .digest('hex')
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email?.trim()) {
      return NextResponse.json({ success: false, error: 'INVALID_EMAIL' }, { status: 400 })
    }

    const normalised = email.trim().toLowerCase()

    // Check email exists
    const users = await studioQueryByIndex<StudioUser>(
      TABLES.users, 'email-index', 'email = :e', { ':e': normalised }
    )
    if (users.length === 0) {
      return NextResponse.json({ success: false, error: 'INVALID_EMAIL' }, { status: 404 })
    }

    // Generate 6-digit OTP, store HMAC (not the OTP itself) in the JWT
    const otp   = String(randomInt(100000, 999999))
    const hmac  = otpHmac(otp, normalised)
    const token = await new SignJWT({ email: normalised, otpHmac: hmac, type: 'pw_reset' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(getSecret())

    const fromEmail = process.env.SES_FROM_EMAIL ?? 'noreply@vayutransfer.com'
    await ses.send(new SendEmailCommand({
      Source: `VayuStudio <${fromEmail}>`,
      Destination: { ToAddresses: [normalised] },
      Message: {
        Subject: { Data: 'Your VayuStudio password reset OTP' },
        Body: {
          Html: {
            Data: `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Inter,system-ui,sans-serif;background:#f8fafc;padding:40px 20px;">
  <div style="max-width:420px;margin:0 auto;background:#fff;border-radius:12px;padding:36px;border:1px solid #e2e8f0;">
    <div style="font-size:20px;font-weight:700;color:#1a202c;margin-bottom:6px;">VayuStudio</div>
    <div style="color:#64748b;font-size:13px;margin-bottom:28px;">Password reset</div>
    <p style="color:#1a202c;font-size:14px;margin:0 0 20px;">Your one-time password to reset your account:</p>
    <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#2563eb;text-align:center;background:#eff6ff;border-radius:10px;padding:18px;margin-bottom:20px;">${otp}</div>
    <p style="color:#64748b;font-size:12px;margin:0;">Valid for <strong>10 minutes</strong>. If you didn't request this, ignore this email.</p>
  </div>
</body></html>`,
            Charset: 'UTF-8',
          },
          Text: { Data: `Your VayuStudio password reset OTP: ${otp}\n\nValid for 10 minutes.` },
        },
      },
    }))

    return NextResponse.json({ success: true, token })
  } catch (err) {
    console.error('[reset/send-otp]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
