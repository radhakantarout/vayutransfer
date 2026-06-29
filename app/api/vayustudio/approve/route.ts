import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { randomUUID } from 'crypto'
import { studioPutItem, studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import { sendStudioCredentialsEmail } from '@/lib/aws/ses'
import type { Studio, StudioUser } from '@/types/studio'

function getEnquirySecret() {
  return new TextEncoder().encode((process.env.STUDIO_JWT_SECRET ?? 'fallback') + '_enquiry')
}

function html(title: string, body: string, loginUrl: string, isError = false): NextResponse {
  const color = isError ? '#F87171' : '#00C6FF'
  const icon  = isError ? '❌' : '✅'
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title} — VayuStudios</title></head>
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
  const origin   = req.nextUrl.origin
  const loginUrl = `${origin}/studio/login`
  const token    = req.nextUrl.searchParams.get('token')
  if (!token) return html('Invalid link', 'No approval token found in this link.', loginUrl, true)

  let payload: { name: string; studioName: string; email: string; phone: string }
  try {
    const { payload: p } = await jwtVerify(token, getEnquirySecret())
    payload = p as typeof payload
  } catch {
    return html('Link expired or invalid', 'This approval link has expired (7-day limit) or is invalid. Ask the photographer to resubmit the enquiry form.', loginUrl, true)
  }

  const { name, studioName, email: rawEmail, phone } = payload
  const email = rawEmail.trim().toLowerCase()

  // Idempotency — check if this email is already onboarded
  const existing = await studioQueryByIndex<StudioUser>(TABLES.users, 'email-index', 'email = :e', { ':e': email })
  if (existing.length > 0) {
    return html('Already approved', `A studio account for <strong>${email}</strong> already exists. The photographer can log in using the link below.`, loginUrl)
  }

  const studioId = randomUUID()
  const userId   = randomUUID()
  const now      = new Date().toISOString()

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
      aiFaceRecognition: false,
    },
  }

  // Create admin user with no password — admin sets their own via the setup link
  const adminUser: StudioUser = {
    userId,
    role: 'ADMIN',
    email,
    phone,
    name,
    linkedStudioId: studioId,
    status: 'ACTIVE',
    lastLoginAt: now,
    createdAt: now,
    updatedAt: now,
  }

  await Promise.all([
    studioPutItem(TABLES.studios, studio as unknown as Record<string, unknown>),
    studioPutItem(TABLES.users,   adminUser as unknown as Record<string, unknown>),
  ])

  // Welcome email — setup=1 auto-opens password-set flow with email pre-filled
  const setupUrl = `${origin}/studio/login?setup=1&email=${encodeURIComponent(email)}`
  void sendStudioCredentialsEmail(email, name, studioName, email, setupUrl)

  return html(
    'Studio approved!',
    `<strong>${studioName}</strong> has been created. A welcome email with a password setup link has been sent to <strong>${email}</strong>.`,
    loginUrl
  )
}
