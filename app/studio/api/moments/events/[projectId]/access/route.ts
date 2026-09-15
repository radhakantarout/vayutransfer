import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { getGalleryMember, isGalleryAdmin } from '@/lib/studio/galleryMembers'
import type { StudioProject } from '@/types/studio'

// GET /studio/api/moments/events/[projectId]/access — the one call the
// Moments gallery page makes before anything else, to learn the caller's
// relationship to this specific gallery: owning admin, a promoted admin, an
// approved member, a pending request, or nothing at all (never been
// invited, or was rejected). Everything the page renders branches off this
// single response instead of separately guessing from partial 403s.
export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId } = params
    const isOwner = !!(await studioGetItem<StudioProject>(TABLES.projects, { studioId: auth.studioId, projectId }))
    const member = await getGalleryMember(projectId, auth.userId)

    if (isOwner || isGalleryAdmin(member)) {
      return NextResponse.json({ success: true, data: { status: 'APPROVED', role: 'ADMIN', isOwner } })
    }
    if (member) {
      return NextResponse.json({ success: true, data: { status: member.status, role: member.role, isOwner: false } })
    }
    return NextResponse.json({ success: true, data: { status: 'NONE', role: null, isOwner: false } })
  } catch (err) {
    console.error('[moments access GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
