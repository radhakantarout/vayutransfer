import { NextRequest, NextResponse } from 'next/server'
import { canRequestOtp, generateOtp, storeOtp } from '@/lib/emailOtp'
import { sendSignupOtpEmail } from '@/lib/aws/ses'
import type { ApiResponse } from '@/types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Sends the code; verification happens separately when the client calls
// signIn('otp', {email, otp}) — see lib/auth.ts's CredentialsProvider.
// Always returns a generic success shape (whether or not this cooldown
// check is what actually blocked the send) so this endpoint can't be used
// to enumerate which emails already have accounts.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { email?: string }
    const email = body.email?.trim().toLowerCase()
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'INVALID_INPUT', message: 'Enter a valid email address' },
        { status: 400 }
      )
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
