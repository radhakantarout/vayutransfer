import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioDeleteItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { resolveProjectForViewer, isOwnerOrAdmin } from '@/lib/studio/galleryMembers'
import type { GalleryComment } from '@/types/studio'

// DELETE — the comment's own author, or the gallery's admin(s), can remove
// it (same "admin can clean up after a member" principle as removing a
// member outright).
export async function DELETE(
  req: NextRequest,
  { params }: { params: { projectId: string; fileId: string; commentId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId, fileId, commentId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const comment = await studioGetItem<GalleryComment>(TABLES.galleryComments, { fileId, commentId })
    if (!comment || comment.projectId !== projectId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const isAuthor = comment.userId === auth.userId
    if (!isAuthor && !isOwnerOrAdmin(auth.studioId, resolved.project, resolved.member)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    await studioDeleteItem(TABLES.galleryComments, { fileId, commentId })
    await studioUpdateItem(TABLES.mediafiles, { projectId, fileId }, 'ADD commentCount :neg', { ':neg': -1 }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[moments comment DELETE]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
