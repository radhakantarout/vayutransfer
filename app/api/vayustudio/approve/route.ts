import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { studioPutItem, studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import type { Studio, StudioUser } from '@/types/studio'

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

function generatePassword(): string {
  const digits = Math.floor(100000 + Math.random() * 900000)
  return `Studio@${digits}`
}

function html(title: string, body: string, loginUrl: string, isError = false): NextResponse {
  const color = isError ? '#F87171' : '#00C6FF'
  const icon  = isError ? '❌' : '✅'
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title} — VayuStudio</title></head>
    <body style="font-family:Inter,system-ui,sans-serif;background:#0B0F1A;color:#E0EAF8;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;">
      <div style="max-width:480px;width:100%;background:#131929;border-radius:16px;padding:40px;border:1px solid #1E2D45;text-align:center;">
        <div style="font-size:48px;margin-bottom:16px;">${icon}</div>
        <div style="font-size:22px;font-weight:700;color:${color};margin-bottom:12px;">${title}</div>
        <div style="color:#8BAAB8;font-size:14px;line-height:1.6;">${body}</div>
        <div style="margin-top:28px;">
          <a href="${loginUrl}"
             style="display:inline-block;background:#00C6FF;color:#0B0F1A;font-weight:700;font-size:13px;padding:12px 28px;border-radius:8px;text-decoration:none;">
            Go to Studio Login
          </a>
        </div>
      </div>
    </body></html>`,
    { status: isError ? 400 : 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

export async function GET(req: NextRequest) {
  const loginUrl = `${req.nextUrl.origin}/studio/login`
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return html('Invalid link', 'No approval token found in this link.', loginUrl, true)

  // Verify signed token
  let payload: { name: string; studioName: string; email: string; phone: string }
  try {
    const { payload: p } = await jwtVerify(token, getEnquirySecret())
    payload = p as typeof payload
  } catch {
    return html('Link expired or invalid', 'This approval link has expired (7-day limit) or is invalid. Ask the photographer to resubmit the enquiry form.', loginUrl, true)
  }

  const { name, studioName, email, phone } = payload

  // Idempotency — check if this email is already onboarded
  const existing = await studioQueryByIndex<StudioUser>(TABLES.users, 'email-index', 'email = :e', { ':e': email })
  if (existing.length > 0) {
    return html('Already approved', `A studio account for <strong>${email}</strong> already exists. The photographer can log in using the link below.`, loginUrl)
  }

  // Generate credentials
  const password     = generatePassword()
  const passwordHash = await bcrypt.hash(password, 10)
  const studioId     = randomUUID()
  const userId       = randomUUID()
  const now          = new Date().toISOString()

  // Create studio
  const studio: Studio = {
    studioId,
    name: studioName,
    ownerUserId: 'platform-owner',
    plan: 'STARTER',
    brandingConfig: {},
    storageUsedBytes: 0,
    projectCount: 0,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    featureFlags: {
      videoSupport: true,
      watermarkToggle: true,
      extendedStorage: false,
      clientComments: true,
      editingRequired: true,
    },
  }
  await studioPutItem(TABLES.studios, studio as unknown as Record<string, unknown>)

  // Create admin user
  const adminUser: StudioUser = {
    userId,
    role: 'ADMIN',
    email,
    phone,
    name,
    passwordHash,
    linkedStudioId: studioId,
    status: 'ACTIVE',
    lastLoginAt: now,
    createdAt: now,
    updatedAt: now,
  }
  await studioPutItem(TABLES.users, adminUser as unknown as Record<string, unknown>)

  const fromEmail  = process.env.SES_FROM_EMAIL ?? 'noreply@vayutransfer.com'
  const ownerEmail = process.env.PLATFORM_OWNER_EMAIL ?? 'radhakanta.rout16@gmail.com'

  const welcomeHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Inter,system-ui,sans-serif;background:#0B0F1A;color:#E0EAF8;margin:0;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:#131929;border-radius:12px;padding:40px;border:1px solid #1E2D45;">
    <div style="font-size:22px;font-weight:700;color:#00C6FF;margin-bottom:4px;">VayuStudio</div>
    <div style="color:#5A7090;font-size:13px;margin-bottom:28px;">Your studio is ready</div>

    <p style="color:#E0EAF8;font-size:22px;font-weight:700;margin:0 0 8px;">Congratulations! 🎉🎁</p>
    <p style="color:#E0EAF8;font-size:15px;margin:0 0 16px;">Hi ${name},</p>
    <p style="color:#8BAAB8;font-size:14px;line-height:1.6;margin:0 0 28px;">
      Your VayuStudio account has been set up. Use the credentials below to sign in and start uploading your first project.
    </p>

    <div style="background:#0B0F1A;border:1px solid #1E2D45;border-radius:10px;padding:20px 24px;margin-bottom:28px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0;color:#5A7090;font-size:13px;width:100px;">Studio</td>
          <td style="padding:6px 0;font-size:14px;color:#E0EAF8;font-weight:600;">${studioName}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#5A7090;font-size:13px;">Email</td>
          <td style="padding:6px 0;font-size:14px;color:#E0EAF8;">${email}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#5A7090;font-size:13px;">Password</td>
          <td style="padding:6px 0;font-size:14px;color:#00C6FF;font-weight:700;letter-spacing:1px;">${password}</td>
        </tr>
      </table>
    </div>

    <a href="${loginUrl}"
       style="display:inline-block;background:#00C6FF;color:#0B0F1A;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;margin-bottom:24px;">
      Sign in to VayuStudio →
    </a>

    <p style="color:#5A7090;font-size:12px;margin:0;">
      Please change your password after your first login. Reply to this email if you need any help.
    </p>
  </div>
</body>
</html>`.trim()

  await ses.send(new SendEmailCommand({
    Source: `VayuStudio <${fromEmail}>`,
    Destination: { ToAddresses: [email] },
    ReplyToAddresses: [ownerEmail],
    Message: {
      Subject: { Data: `Your VayuStudio account is ready — ${studioName}` },
      Body: {
        Html: { Data: welcomeHtml, Charset: 'UTF-8' },
        Text: { Data: `Hi ${name},\n\nYour VayuStudio account is ready.\n\nStudio: ${studioName}\nEmail: ${email}\nPassword: ${password}\n\nSign in: ${loginUrl}\n\nPlease change your password after first login.` },
      },
    },
  }))

  return html(
    'Studio approved!',
    `<strong>${studioName}</strong> has been created and login credentials have been sent to <strong>${email}</strong>.`,
    loginUrl
  )
}
