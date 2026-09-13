import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByPK, studioQueryByIndex, studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject, GalleryMember } from '@/types/studio'

// GET — lightweight v1 (per the redesign plan): the only "notification" that
// exists today is a pending join request. No new table — sums the pending
// count across every gallery this caller administers (owned outright, or
// promoted), the same two lookups /studio/api/moments/events already does,
// plus one members-table query per admin gallery.
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const owned = await studioQueryByPK<StudioProject>(TABLES.projects, 'studioId', auth.studioId)
    const ownedIds = new Set(owned.map((p) => p.projectId))

    const memberships = await studioQueryByIndex<GalleryMember>(
      TABLES.galleryMembers, 'userId-index', 'userId = :u', { ':u': auth.userId }
    ).catch(() => [] as GalleryMember[])
    const promotedAdminMemberships = memberships.filter(
      (m) => m.role === 'ADMIN' && m.status === 'APPROVED' && !ownedIds.has(m.projectId)
    )
    const promotedProjects = (await Promise.all(
      promotedAdminMemberships.map((m) => studioGetItem<StudioProject>(TABLES.projects, { studioId: m.studioId, projectId: m.projectId }))
    )).filter((p): p is StudioProject => !!p)

    const adminProjects = [...owned, ...promotedProjects]

    const perGallery = await Promise.all(adminProjects.map(async (project) => {
      const members = await studioQueryByPK<GalleryMember>(TABLES.galleryMembers, 'projectId', project.projectId)
      const pending = members.filter((m) => m.status === 'PENDING')
      return {
        projectId: project.projectId,
        eventName: project.clientName,
        pendingCount: pending.length,
        pending: pending.map((m) => ({ userId: m.userId, name: m.name ?? 'Someone', createdAt: m.createdAt })),
      }
    }))

    const withPending = perGallery.filter((g) => g.pendingCount > 0)
    const totalPending = withPending.reduce((sum, g) => sum + g.pendingCount, 0)

    return NextResponse.json({ success: true, data: { totalPending, galleries: withPending } })
  } catch (err) {
    console.error('[moments notifications GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
