import { NextRequest, NextResponse } from 'next/server'
import { randomUUID, createHash } from 'crypto'
import { verifyGoogleSignupToken } from '@/lib/studio/googleAuth'
import { signStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioPutItem, studioQueryByIndex, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { MOMENTS_RETENTION_DAYS } from '@/constants/studioPricing'
import { getPricingConfig } from '@/lib/pricingConfig'
import type { Studio, StudioUser } from '@/types/studio'

// Deterministic (not random) specifically for Moments personal studios —
// the SAME email always produces the SAME studioId, which is what makes
// the conditional PUT below ("attribute_not_exists(studioId)") an atomic,
// database-enforced "one personal studio per email" guarantee instead of
// the previous plain read-then-write, which let concurrent signups with
// the same (replayable, 30-minute-lived) Google signup token each create
// a full new free Studio. Real studios (photographers) are entirely
// unaffected — they still get random UUIDs via a separate code path
// (app/studio/api/auth/google-onboard/route.ts), never this function.
function momentsStudioIdFor(email: string): string {
  return `moments-${createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 32)}`
}

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

    const studioId = momentsStudioIdFor(email)
    const userId   = existingClient?.userId ?? randomUUID()
    const pricing = await getPricingConfig()
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
      // Explicit, Moments-only welcome bonus (in raw AI-search credits,
      // computed from the live momentsWelcomeBonusCredits/momentsCreditDivisor
      // config) — deliberately NOT the shared freeAiSearchCredits default,
      // which is also Studio Admin's own free-tier lever and must stay
      // independent of Moments' bonus sizing. Without this explicit set,
      // aiCreditsQuota() would silently fall back to freeAiSearchCredits
      // instead, under-granting every new Moments signup.
      aiSearchCreditsTotal: pricing.momentsWelcomeBonusCredits * pricing.momentsCreditDivisor,
      momentsWelcomeBonusGrantedAt: now,
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
    try {
      // Atomic create-if-not-exists — the Google signup token this route
      // trusts is stateless with no single-use tracking, so it can be
      // replayed any number of times within its 30-minute window. Without
      // this guard, a burst of concurrent/replayed requests for the same
      // email each raced past the plain existingClient read above and each
      // created a full new free Studio (storage + AI credits). Whichever
      // request loses this race did NOT create a studio and must not
      // proceed to create a StudioUser row either — it falls through to
      // the catch block and logs in as whichever request won instead.
      await studioPutItem(TABLES.studios, studio as unknown as Record<string, unknown>, 'attribute_not_exists(studioId)')
    } catch (err) {
      // Brief single retry — the winning request's studio PUT above just
      // succeeded, but its StudioUser row write (a few lines below, in that
      // request) may not have landed yet in this narrow window. One short
      // wait covers that without a full retry loop.
      let winnerStudio = await studioGetItem<Studio>(TABLES.studios, { studioId })
      let winnerClients = await studioQueryByIndex<StudioUser>(TABLES.users, 'email-index', 'email = :e', { ':e': email })
      let winnerClient = winnerClients.find((u) => u.role === 'CLIENT' && u.personalStudioId === studioId)
      if (!winnerClient) {
        await new Promise((resolve) => setTimeout(resolve, 300))
        winnerStudio = await studioGetItem<Studio>(TABLES.studios, { studioId })
        winnerClients = await studioQueryByIndex<StudioUser>(TABLES.users, 'email-index', 'email = :e', { ':e': email })
        winnerClient = winnerClients.find((u) => u.role === 'CLIENT' && u.personalStudioId === studioId)
      }
      if (!winnerStudio || !winnerClient) {
        console.error('[moments-onboard POST] lost the create race but could not find the winner', err)
        return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
      }
      const token = await signStudioJWT({ userId: winnerClient.userId, role: 'CLIENT', studioId })
      const response = NextResponse.json({ success: true, data: { alreadyExists: true } })
      setCookies(response, token, { role: 'CLIENT', name: winnerClient.name ?? name, email })
      return response
    }

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
