import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject } from '@/types/studio'

function getSecret() {
  return new TextEncoder().encode(process.env.STUDIO_JWT_SECRET!)
}

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId } = params
    const studioId = auth.studioId!

    const project = await studioGetItem<StudioProject>(TABLES.projects, { studioId, projectId })
    if (!project) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const expiryHours: number = body.expiryHours ?? 24
    if (![12, 24, 48].includes(expiryHours)) {
      return NextResponse.json({ success: false, error: 'INVALID_EXPIRY' }, { status: 400 })
    }
    const allowOriginalDownload = body.allowOriginalDownload === true

    // Signed into the token itself (not a DB field) — this is a per-QR-link
    // choice the admin makes at generation time, and every guest-facing route
    // already verifies this same JWT, so the download route can trust the
    // flag server-side without an extra DB lookup.
    const token = await new SignJWT({ projectId, studioId, type: 'GUEST_QR', allowOriginalDownload })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${expiryHours}h`)
      .sign(getSecret())

    const proto = req.headers.get('x-forwarded-proto') ?? 'https'
    const host  = req.headers.get('host') ?? 'test.vayutransfer.com'
    const qrUrl = `${proto}://${host}/studio/guest/${token}`
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString()

    return NextResponse.json({ success: true, data: { token, qrUrl, expiresAt, expiryHours } })
  } catch (err) {
    console.error('[guest-token POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
