import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { SignJWT } from 'jose'
import { authOptions } from '@/lib/auth'
import { studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import type { StudioUser } from '@/types/studio'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const ses = new SESClient({
  region: process.env.SES_REGION ?? 'ap-south-1',
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
      : undefined,
})

function getEnquirySecret() {
  return new TextEncoder().encode((process.env.STUDIO_JWT_SECRET ?? 'fallback') + '_enquiry')
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

export async function POST(req: NextRequest) {
  try {
    const { name, studioName, email: rawEmail, phone, message } = await req.json()

    // Two callers share this route: app/vayustudio/EnquiryForm.tsx (on
    // vayutransfer.com, where NextAuth/Google sign-in is the native auth
    // system) requires a real signed-in session and never sends `email` at
    // all — the verified session email is used, ignoring anything in the
    // body. app/studio/home/EnquiryForm.tsx (on vayustudios.com, which uses
    // its own separate studio_token JWT auth, not NextAuth — Google OAuth
    // isn't registered for that domain, so gating it the same way would
    // just break it) still sends a free-text email, validated below rather
    // than trusted blindly. Both paths get the same length/format hardening
    // — only the email's trust level differs.
    const session = await getServerSession(authOptions)
    let email: string
    if (session?.user?.email) {
      email = session.user.email.trim().toLowerCase()
    } else {
      if (!rawEmail || !isValidEmail(rawEmail)) {
        return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
      }
      email = rawEmail.trim().toLowerCase()
    }

    if (!name || !studioName || !phone) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }
    // Never trust free-text length/format from a POST body, session or not
    // — name/studioName/message are always arbitrary user input.
    if (name.length > 100 || studioName.length > 100 || (message && message.length > 2000)) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }
    if (!/^[+\d][\d\s-]{6,19}$/.test(phone.trim())) {
      return NextResponse.json({ success: false, error: 'INVALID_PHONE' }, { status: 400 })
    }

    // Check for an existing studio account before emailing the owner — catches duplicates
    // at submission time instead of leaving the requester waiting on an enquiry that will
    // just get rejected implicitly when the owner clicks approve.
    const existing = await studioQueryByIndex<StudioUser>(
      TABLES.users, 'email-index', 'email = :e', { ':e': email }
    )
    if (existing.length > 0) {
      return NextResponse.json({ success: false, error: 'EMAIL_EXISTS' }, { status: 409 })
    }

    // Signed token embeds all enquiry data — approve link works from any device, no login needed
    const token = await new SignJWT({ name, studioName, email, phone })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('7d')
      .sign(getEnquirySecret())

    const origin = req.nextUrl.origin
    const approveUrl = `${origin}/api/vayustudio/approve?token=${encodeURIComponent(token)}`

    const ownerEmail = process.env.PLATFORM_OWNER_EMAIL ?? 'support@vayutransfer.com'
    const fromEmail  = process.env.SES_FROM_EMAIL ?? 'noreply@vayutransfer.com'

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Inter,system-ui,sans-serif;background:#0B0F1A;color:#E0EAF8;margin:0;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:#131929;border-radius:12px;padding:40px;border:1px solid #1E2D45;">
    <div style="font-size:22px;font-weight:700;color:#00C6FF;margin-bottom:4px;">VayuStudios</div>
    <div style="color:#5A7090;font-size:13px;margin-bottom:28px;">New studio enquiry</div>

    <table style="width:100%;border-collapse:collapse;">
      ${[
        ['Name',    name],
        ['Studio',  studioName],
        ['Email',   email],
        ['Phone',   phone],
        ['Message', message || '—'],
      ].map(([label, value]) => `
      <tr>
        <td style="padding:8px 0;color:#5A7090;font-size:13px;width:100px;vertical-align:top;">${escapeHtml(label)}</td>
        <td style="padding:8px 0;font-size:14px;color:#E0EAF8;">${escapeHtml(String(value))}</td>
      </tr>`).join('')}
    </table>

    <div style="margin-top:32px;">
      <a href="${approveUrl}"
         style="display:inline-block;background:#00C6FF;color:#0B0F1A;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;">
        ✅ Approve &amp; Create Studio
      </a>
    </div>

    <div style="margin-top:16px;color:#5A7090;font-size:12px;">
      Tapping this button will automatically create the studio, generate credentials, and email the photographer their login details.
      Link expires in 7 days.
    </div>

    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #1E2D45;color:#5A7090;font-size:12px;">
      Received via vayutransfer.com/vayustudio
    </div>
  </div>
</body>
</html>`.trim()

    await ses.send(new SendEmailCommand({
      Source: `VayuStudios Enquiries <${fromEmail}>`,
      Destination: { ToAddresses: [ownerEmail] },
      ReplyToAddresses: [email],
      Message: {
        Subject: { Data: `VayuStudios enquiry — ${studioName} (${name})` },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
          Text: { Data: `New enquiry\n\nName: ${name}\nStudio: ${studioName}\nEmail: ${email}\nPhone: ${phone}\nMessage: ${message || '—'}\n\nApprove: ${approveUrl}` },
        },
      },
    }))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[vayustudio enquiry]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
