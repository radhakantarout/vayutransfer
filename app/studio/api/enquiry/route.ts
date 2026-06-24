import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { sendEnquiryNotificationEmail } from '@/lib/aws/ses'

function getSecret() {
  const s = process.env.STUDIO_JWT_SECRET
  if (!s) throw new Error('STUDIO_JWT_SECRET not set')
  return new TextEncoder().encode(s)
}

export async function POST(req: NextRequest) {
  try {
    const { studioName, adminName, email, phone, message } = await req.json()

    if (!studioName?.trim() || !adminName?.trim() || !email?.trim() || !phone?.trim()) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    // Encode enquiry as a signed JWT — no DB needed, token IS the pending record
    const token = await new SignJWT({
      studioName: studioName.trim(),
      adminName:  adminName.trim(),
      email:      email.trim().toLowerCase(),
      phone:      phone.trim(),
      message:    (message ?? '').trim(),
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(getSecret())

    const approveUrl = `${req.nextUrl.origin}/studio/api/owner/approve?token=${token}`

    const ownerEmail = process.env.PLATFORM_OWNER_EMAIL
    if (ownerEmail) {
      void sendEnquiryNotificationEmail(
        ownerEmail,
        studioName.trim(),
        adminName.trim(),
        email.trim(),
        phone.trim(),
        (message ?? '').trim(),
        approveUrl
      )
    } else {
      console.log('[enquiry] No PLATFORM_OWNER_EMAIL set. Approve URL:', approveUrl)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[enquiry POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
