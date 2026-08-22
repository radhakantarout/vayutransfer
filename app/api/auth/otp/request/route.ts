import { NextRequest, NextResponse } from 'next/server'
import { canRequestOtp, generateOtp, storeOtp } from '@/lib/emailOtp'
import { sendSignupOtpEmail } from '@/lib/aws/ses'
import { findUserByEmail } from '@/lib/users'
import type { ApiResponse } from '@/types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Sends the code; verification happens separately when the client calls
// signIn('otp', {email, otp}) — see lib/auth.ts's CredentialsProvider.
// On the login page (mode omitted/'login') this stays a generic success
// shape regardless of whether the email has an account, so it can't be
// used to enumerate registered emails. mode:'signup' deliberately breaks
// that — the signup page needs to tell "you already have an account,
// sign in instead" *before* sending a code, rather than silently logging
// the person into their existing account.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { email?: string; mode?: 'signup' | 'login' }
    const email = body.email?.trim().toLowerCase()
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'INVALID_INPUT', message: 'Enter a valid email address' },
        { status: 400 }
      )
    }

    if (body.mode === 'signup') {
      const existing = await findUserByEmail(email)
      if (existing) {
        return NextResponse.json<ApiResponse<never>>(
          { success: false, error: 'ACCOUNT_EXISTS', message: 'An account with this email already exists — sign in instead.' },
          { status: 409 }
        )
      }
    }

    const allowed = await canRequestOtp(email)
    if (!allowed) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'RATE_LIMITED', message: 'Please wait a minute before requesting another code' },
        { status: 429 }
      )
    }

    const otp = generateOtp()
    await storeOtp(email, otp)
    await sendSignupOtpEmail(email, otp)

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[OTP] ${email}: ${otp}`)
    }

    return NextResponse.json<ApiResponse<{ sent: true }>>({ success: true, data: { sent: true } })
  } catch (err) {
    console.error('[auth/otp/request]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to send verification code' },
      { status: 500 }
    )
  }
}
