import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByIndex, studioGetItem, studioQueryByPK, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject, StudioFace } from '@/types/studio'

// Client-facing read of the same admin-curated groups
// (app/studio/api/admin/projects/[projectId]/faces/groups/route.ts) — same
// auth pattern as every other client-gallery route, plus scoping each
// group's photoIds down to whatever this particular share link actually
// exposes (sharedFileIds, when the admin shared an explicit subset).
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string; projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth) {
      return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 })
    }

    const { token, projectId } = params

    const entryProjects = await studioQueryByIndex<StudioProject>(
      TABLES.projects,
      'clientShareToken-index',
      'clientShareToken = :token',
      { ':token': token }
    )
    const entry = entryProjects[0]
    const isClient = auth.role === 'CLIENT' && auth.projectId === entry?.projectId
    const isStudioPreview = !!entry && ['ADMIN', 'OWNER'].includes(auth.role) && auth.studioId === entry.studioId
    if (!entry || (!isClient && !isStudioPreview)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    if (!entry.clientShareExpiresAt || new Date(entry.clientShareExpiresAt) < new Date()) {
      return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
    }

    const project = await studioGetItem<StudioProject>(TABLES.projects, { studioId: entry.studioId, projectId })
    if (!project) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    if (project.clientEmail !== entry.clientEmail) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    if (!project.clientShareToken || !project.clientShareExpiresAt || new Date(project.clientShareExpiresAt) < new Date()) {
      return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
    }

    const groups = await studioQueryByPK<StudioFace>(TABLES.faces, 'projectId', projectId)

    const sharedSet = project.sharedFileIds && project.sharedFileIds.length > 0
      ? new Set(project.sharedFileIds)
      : null

    const scoped = sharedSet
      ? groups
          .map(g => {
            const photoIds = g.photoIds.filter(id => sharedSet.has(id))
            return { ...g, photoIds, photoCount: photoIds.length }
          })
          .filter(g => g.photoCount > 0)
      : groups

    scoped.sort((a, b) => b.photoCount - a.photoCount)

    return NextResponse.json({ success: true, data: scoped })
  } catch (err) {
    console.error('[client faces/groups GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
