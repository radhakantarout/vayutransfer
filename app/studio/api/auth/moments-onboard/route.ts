import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { verifyGoogleSignupToken } from '@/lib/studio/googleAuth'
import { signStudioJWT } from '@/lib/studio/auth'
import { studioPutItem, studioQueryByIndex, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { MOMENTS_RETENTION_DAYS } from '@/constants/studioPricing'
import type { Studio, StudioUser } from '@/types/studio'

// GET — same shape as google-onboard's: the register page calls this on
// mount to validate the token and pre-fill the form.
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

// POST — creates a personal Studio (the Moments billing/quota owner) and a
// CLIENT-role StudioUser, or — if this email already has a CLIENT identity
// from a photographer's gallery link — just attaches a personal Studio to
// that *existing* row. Never creates or touches an ADMIN row: Moments
// identity and Studio Admin identity are deliberately separate rows even
// for the same email, so a Moments session can never carry admin access.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as {
      token?: string; name?: string; phone?: string
    } | null

    if (!body?.token || !body.name?.trim() || !body.phone) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    const identity = await verifyGoogleSignupToken(body.token)
    if (!identity) return NextResponse.json({ success: false, error: 'EXPIRED_TOKEN' }, { status: 400 })

    const phoneDigits = body.phone.replace(/\D/g, '').slice(-10)
    if (!isValidPhone(phoneDigits)) {
      return NextResponse.json({ success: false, error: 'INVALID_PHONE' }, { status: 400 })
    }

    const email = identity.email
    const name  = body.name.trim()
    const phone = `+91${phoneDigits}`
    const now   = new Date().toISOString()

    const existingClients = await studioQueryByIndex<StudioUser>(TABLES.users, 'email-index', 'email = :e', { ':e': email })
    const existingClient = existingClients.find((u) => u.role === 'CLIENT')

    // Race guard — already has a personal Studio (e.g. two tabs submitting
    // at once), just log them in rather than creating a second one.
    if (existingClient?.personalStudioId) {
      const token = await signStudioJWT({ userId: existingClient.userId, role: 'CLIENT', studioId: existingClient.personalStudioId })
      const response = NextResponse.json({ success: true, data: { alreadyExists: true } })
      setCookies(response, token, { role: 'CLIENT', name: existingClient.name ?? name, email })
      return response
    }

    const studioId = randomUUID()
    const userId   = existingClient?.userId ?? randomUUID()
    const studio: Studio = {
      studioId,
      name: `${name}'s Moments`,
      ownerUserId: userId,
      plan: 'STARTER',
      brandingConfig: {},
      storageUsedBytes: 0,
      billableStorageBytes: 0,
      storageGrants: [],
      billingPlanId: 'free',
      dataRetentionGraceDays: MOMENTS_RETENTION_DAYS,
      isIndividual: true,
      projectCount: 0,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      featureFlags: {
        videoSupport: true,
        watermarkToggle: false,
        extendedStorage: false,
        clientComments: true,
        editingRequired: false,
        aiFaceRecognition: true,
      },
    }
    await studioPutItem(TABLES.studios, studio as unknown as Record<string, unknown>)

    if (existingClient) {
      // Already a CLIENT of some photographer's gallery — attach the new
      // personal Studio to that same identity instead of forking a new one.
      await studioUpdateItem(
        TABLES.users,
        { userId },
        'SET personalStudioId = :sid, lastLoginAt = :now, updatedAt = :now',
        { ':sid': studioId, ':now': now }
      )
    } else {
      const clientUser: StudioUser = {
        userId,
        role: 'CLIENT',
        email,
        phone,
        name,
        personalStudioId: studioId,
        status: 'ACTIVE',
        lastLoginAt: now,
        createdAt: now,
        updatedAt: now,
      }
      await studioPutItem(TABLES.users, clientUser as unknown as Record<string, unknown>)
    }

    const token = await signStudioJWT({ userId, role: 'CLIENT', studioId })
    const response = NextResponse.json({ success: true, data: { studioId } })
    setCookies(response, token, { role: 'CLIENT', name, email })
    return response
  } catch (err) {
    console.error('[moments-onboard POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

function setCookies(response: NextResponse, token: string, user: { role: string; name?: string; email?: string }) {
  response.cookies.set('studio_token', token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24 * 30, path: '/',
  })
  response.cookies.set('studio_ui', JSON.stringify({ role: user.role, name: user.name ?? '', email: user.email ?? '' }), {
    httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24 * 30, path: '/',
  })
}
