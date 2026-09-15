import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, studioDeleteItem, TABLES } from '@/lib/studio/dynamodb'
import { getGalleryMember, resolveProjectForViewer, isOwnerOrAdmin } from '@/lib/studio/galleryMembers'
import type { Studio } from '@/types/studio'

// PATCH — approve/reject a pending request, or promote/demote an existing
// member's role. Owner/admin only. One route for all four actions since
// they're all just a status/role field flip on the same row.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { projectId: string; userId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId, userId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved || !isOwnerOrAdmin(auth.studioId, resolved.project, resolved.member)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    const { project } = resolved

    const target = await getGalleryMember(projectId, userId)
    if (!target) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    const { action } = await req.json().catch(() => ({})) as { action?: 'approve' | 'reject' | 'promote' | 'demote' }
    const now = new Date().toISOString()

    if (action === 'approve' || action === 'reject') {
      if (target.status !== 'PENDING') {
        return NextResponse.json({ success: false, error: 'INVALID_STATE', message: 'This request has already been handled.' }, { status: 409 })
      }
      await studioUpdateItem(
        TABLES.galleryMembers,
        { projectId, userId },
        'SET #s = :status, respondedAt = :now, updatedAt = :now',
        { ':status': action === 'approve' ? 'APPROVED' : 'REJECTED', ':now': now },
        { '#s': 'status' }
      )
      return NextResponse.json({ success: true, data: { status: action === 'approve' ? 'APPROVED' : 'REJECTED' } })
    }

    if (action === 'promote' || action === 'demote') {
      // The project's own creator (personal Studio owner) can't be demoted
      // through this — they're the one account that can never lose access
      // to their own gallery.
      if (action === 'demote') {
        const studio = await studioGetItem<Studio>(TABLES.studios, { studioId: project.studioId })
        if (studio?.ownerUserId === userId) {
          return NextResponse.json({ success: false, error: 'CANNOT_DEMOTE_OWNER' }, { status: 400 })
        }
      }
      await studioUpdateItem(
        TABLES.galleryMembers,
        { projectId, userId },
        'SET #r = :role, updatedAt = :now',
        { ':role': action === 'promote' ? 'ADMIN' : 'MEMBER', ':now': now },
        { '#r': 'role' }
      )
      return NextResponse.json({ success: true, data: { role: action === 'promote' ? 'ADMIN' : 'MEMBER' } })
    }

    return NextResponse.json({ success: false, error: 'INVALID_ACTION' }, { status: 400 })
  } catch (err) {
    console.error('[moments member PATCH]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

// DELETE — remove a member outright (design doc decision #4: "admin can
// remove a member... in one action"). No upload cascade in this pass since
// only admins can upload today (Phase 2 upload routes stay owner/admin-only)
// — a plain member has nothing else of theirs to clean up yet.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { projectId: string; userId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId, userId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved || !isOwnerOrAdmin(auth.studioId, resolved.project, resolved.member)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    if (userId === auth.userId) {
      return NextResponse.json({ success: false, error: 'CANNOT_REMOVE_SELF' }, { status: 400 })
    }

    await studioDeleteItem(TABLES.galleryMembers, { projectId, userId })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[moments member DELETE]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
