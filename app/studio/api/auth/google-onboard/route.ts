import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { verifyGoogleSignupToken } from '@/lib/studio/googleAuth'
import { signStudioJWT } from '@/lib/studio/auth'
import { studioPutItem, studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import { sendOwnerStudioCreatedEmail, sendStudioCredentialsEmail } from '@/lib/aws/ses'
import { DEFAULT_RETENTION_GRACE_DAYS } from '@/constants/studioPricing'
import type { Studio, StudioUser } from '@/types/studio'

// GET — the register page calls this on mount to validate the token and
// pre-fill the form; the page never decodes the JWT itself.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ success: false, error: 'INVALID_TOKEN' }, { status: 400 })

  const identity = await verifyGoogleSignupToken(token)
  if (!identity) return NextResponse.json({ success: false, error: 'EXPIRED_TOKEN' }, { status: 400 })

  return NextResponse.json({ success: true, data: identity })
}

function isValidPhone(digits: string) {
  return /^[6-9]\d{9}$/.test(digits.trim())
}

// POST — creates the studio + admin account immediately, no manual approval.
// Safe because the email comes from the signed token (verified Google identity),
// never from an editable form field.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as {
      token?: string; studioName?: string; adminName?: string; phone?: string; message?: string
    } | null

    if (!body?.token || !body.studioName?.trim() || !body.adminName?.trim() || !body.phone) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    const identity = await verifyGoogleSignupToken(body.token)
    if (!identity) return NextResponse.json({ success: false, error: 'EXPIRED_TOKEN' }, { status: 400 })

    const phoneDigits = body.phone.replace(/\D/g, '').slice(-10)
    if (!isValidPhone(phoneDigits)) {
      return NextResponse.json({ success: false, error: 'INVALID_PHONE' }, { status: 400 })
    }

    const email = identity.email
    const studioName = body.studioName.trim()
    const adminName  = body.adminName.trim()
    const phone      = `+91${phoneDigits}`
    const message    = body.message?.trim() || undefined

    // Race guard — if an account appeared between callback and submit, just log them in
    const existing = await studioQueryByIndex<StudioUser>(TABLES.users, 'email-index', 'email = :e', { ':e': email })
    if (existing.length > 0) {
      const existingUser = existing[0]
      const token = await signStudioJWT({ userId: existingUser.userId, role: existingUser.role, studioId: existingUser.linkedStudioId })
      const response = NextResponse.json({ success: true, data: { alreadyExists: true } })
      response.cookies.set('studio_token', token, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24, path: '/',
      })
      response.cookies.set('studio_ui', JSON.stringify({ role: existingUser.role, name: existingUser.name ?? '', email: existingUser.email ?? '' }), {
        httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24, path: '/',
      })
      return response
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
      billableStorageBytes: 0,
      storageGrants: [],
      dataRetentionGraceDays: DEFAULT_RETENTION_GRACE_DAYS,
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

    const adminUser: StudioUser = {
      userId,
      role: 'ADMIN',
      email,
      phone,
      name: adminName,
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

    // Fire-and-forget notifications — never block the response on SES
    const ownerEmail = process.env.PLATFORM_OWNER_EMAIL
    if (ownerEmail) {
      sendOwnerStudioCreatedEmail(ownerEmail, studioName, adminName, email, message)
        .catch((err) => console.error('[google-onboard] owner email failed', err))
    }
    const setupUrl = `${req.nextUrl.origin}/studio/login?setup=1&email=${encodeURIComponent(email)}`
    sendStudioCredentialsEmail(email, adminName, studioName, email, setupUrl)
      .catch((err) => console.error('[google-onboard] admin email failed', err))

    const token = await signStudioJWT({ userId, role: 'ADMIN', studioId })
    const response = NextResponse.json({ success: true, data: { studioId } })
    response.cookies.set('studio_token', token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24, path: '/',
    })
    response.cookies.set('studio_ui', JSON.stringify({ role: 'ADMIN', name: adminName, email }), {
      httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24, path: '/',
    })
    return response
  } catch (err) {
    console.error('[google-onboard POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
