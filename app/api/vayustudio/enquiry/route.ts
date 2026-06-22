import { NextRequest, NextResponse } from 'next/server'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { SignJWT } from 'jose'

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

export async function POST(req: NextRequest) {
  try {
    const { name, studioName, email, phone, message } = await req.json()

    if (!name || !studioName || !email || !phone) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    // Signed token embeds all enquiry data — approve link works from any device, no login needed
    const token = await new SignJWT({ name, studioName, email, phone })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('7d')
      .sign(getEnquirySecret())

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://vayutransfer.com'
    const approveUrl = `${appUrl}/api/vayustudio/approve?token=${encodeURIComponent(token)}`

    const ownerEmail = process.env.PLATFORM_OWNER_EMAIL ?? 'radhakanta.rout16@gmail.com'
    const fromEmail  = process.env.SES_FROM_EMAIL ?? 'noreply@vayutransfer.com'

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Inter,system-ui,sans-serif;background:#0B0F1A;color:#E0EAF8;margin:0;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:#131929;border-radius:12px;padding:40px;border:1px solid #1E2D45;">
    <div style="font-size:22px;font-weight:700;color:#00C6FF;margin-bottom:4px;">VayuStudio</div>
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
        <td style="padding:8px 0;color:#5A7090;font-size:13px;width:100px;vertical-align:top;">${label}</td>
        <td style="padding:8px 0;font-size:14px;color:#E0EAF8;">${value}</td>
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
      Source: `VayuStudio Enquiries <${fromEmail}>`,
      Destination: { ToAddresses: [ownerEmail] },
      ReplyToAddresses: [email],
      Message: {
        Subject: { Data: `VayuStudio enquiry — ${studioName} (${name})` },
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
