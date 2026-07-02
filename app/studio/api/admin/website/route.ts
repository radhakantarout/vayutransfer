import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { getWebsiteByStudioId, getWebsiteBySubdomain, saveWebsite, buildDefaultWebsite, slugifyStudioName } from '@/lib/studio/website'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import type { Studio, StudioWebsite } from '@/types/studio'

// GET — fetch this studio's website config
export async function GET(req: NextRequest) {
  const auth = await verifyStudioJWT(req)
  if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
    return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }
  const studioId = auth.studioId
  if (!studioId) return NextResponse.json({ success: false, error: 'NO_STUDIO' }, { status: 400 })

  const website = await getWebsiteByStudioId(studioId)
  return NextResponse.json({ success: true, data: website ?? null })
}

// PUT — create or update website config
export async function PUT(req: NextRequest) {
  const auth = await verifyStudioJWT(req)
  if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
    return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }
  const studioId = auth.studioId
  if (!studioId) return NextResponse.json({ success: false, error: 'NO_STUDIO' }, { status: 400 })

  const body: Partial<StudioWebsite> = await req.json()

  // Get or build existing site
  let existing = await getWebsiteByStudioId(studioId)
  if (!existing) {
    const studio = await studioGetItem<Studio>(TABLES.studios, { studioId })
    const baseName = slugifyStudioName(studio?.name ?? 'studio')
    // Auto-suffix if taken
    let candidate = baseName
    let suffix = 1
    while (!(await getWebsiteBySubdomain(candidate) === null)) {
      candidate = `${baseName}${suffix++}`
    }
    existing = buildDefaultWebsite(studioId, studio?.name ?? 'Studio', candidate)
  }

  // Subdomain change — validate uniqueness
  if (body.subdomain && body.subdomain !== existing.subdomain) {
    const slug = body.subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32)
    const taken = await getWebsiteBySubdomain(slug)
    if (taken && taken.studioId !== studioId) {
      return NextResponse.json({ success: false, error: 'SUBDOMAIN_TAKEN', message: `"${slug}" is already taken` }, { status: 409 })
    }
    body.subdomain = slug
  }

  const updated: StudioWebsite = {
    ...existing,
    ...body,
    studioId,
    updatedAt: new Date().toISOString(),
  }

  await saveWebsite(updated)
  return NextResponse.json({ success: true, data: updated })
}
