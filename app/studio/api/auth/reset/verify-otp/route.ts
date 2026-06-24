import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify, SignJWT } from 'jose'
import { createHmac } from 'crypto'

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
    const { token, otp } = await req.json()
    if (!token || !otp) {
      return NextResponse.json({ success: false, error: 'MISSING_FIELDS' }, { status: 400 })
    }

    const { payload } = await jwtVerify(token, getSecret())
    const { email, otpHmac: storedHmac, type } = payload as {
      email: string; otpHmac: string; type: string
    }

    if (type !== 'pw_reset') {
      return NextResponse.json({ success: false, error: 'INVALID_TOKEN' }, { status: 400 })
    }

    const expectedHmac = otpHmac(otp.trim(), email)
    if (expectedHmac !== storedHmac) {
      return NextResponse.json({ success: false, error: 'INVALID_OTP' }, { status: 400 })
    }

    // Issue a short-lived verified reset token
    const resetToken = await new SignJWT({ email, type: 'pw_reset_verified' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(getSecret())

    return NextResponse.json({ success: true, resetToken })
  } catch (err: unknown) {
    const isExpired = err instanceof Error && err.message?.includes('exp')
    if (isExpired) {
      return NextResponse.json({ success: false, error: 'OTP_EXPIRED' }, { status: 400 })
    }
    console.error('[reset/verify-otp]', err)
    return NextResponse.json({ success: false, error: 'INVALID_TOKEN' }, { status: 400 })
  }
}
