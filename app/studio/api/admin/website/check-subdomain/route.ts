import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { getWebsiteBySubdomain } from '@/lib/studio/website'

const RESERVED = new Set(['www', 'api', 'test', 'admin', 'mail', 'smtp', 'support', 'help', 'app', 'dashboard'])

export async function GET(req: NextRequest) {
  const auth = await verifyStudioJWT(req)
  if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
    return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  const raw = req.nextUrl.searchParams.get('slug') ?? ''
  const slug = raw.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32)

  if (slug.length < 3) {
    return NextResponse.json({ success: false, available: false, message: 'Minimum 3 characters' })
  }
  if (RESERVED.has(slug)) {
    return NextResponse.json({ success: false, available: false, message: 'This name is reserved' })
  }

  const existing = await getWebsiteBySubdomain(slug)
  const available = !existing || existing.studioId === auth.studioId

  const studioBase = (process.env.NEXT_PUBLIC_STUDIO_URL ?? 'https://vayustudios.com')
    .replace(/^https?:\/\//, '')
  const siteUrl = `https://${slug}.${studioBase}`

  return NextResponse.json({
    success: true,
    available,
    slug,
    url: siteUrl,
    message: available ? `${slug}.${studioBase} is available!` : `${slug}.${studioBase} is already taken`,
  })
}
