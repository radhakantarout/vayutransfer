import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioPutItem, studioDeleteItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { resolveProjectForViewer, isApprovedMember, isOwnerOrAdmin } from '@/lib/studio/galleryMembers'
import type { GalleryLike } from '@/types/studio'

// POST — toggle like on a photo/video. Any approved member (any role,
// including admins) can like — this is the "engage with the gallery" tier
// of access, not gated behind allowMemberDownloads/allowMemberReels.
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string; fileId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId, fileId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    if (!isOwnerOrAdmin(auth.studioId, resolved.project, resolved.member) && !isApprovedMember(resolved.member)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const existing = await studioGetItem<GalleryLike>(TABLES.galleryLikes, { fileId, userId: auth.userId })

    if (existing) {
      await studioDeleteItem(TABLES.galleryLikes, { fileId, userId: auth.userId })
      await studioUpdateItem(
        TABLES.mediafiles, { projectId, fileId },
        'ADD likeCount :neg', { ':neg': -1 }
      ).catch(() => {})
      return NextResponse.json({ success: true, data: { liked: false } })
    }

    const like: GalleryLike = { fileId, userId: auth.userId, name: resolved.member?.name, createdAt: new Date().toISOString() }
    await studioPutItem(TABLES.galleryLikes, like as unknown as Record<string, unknown>)
    await studioUpdateItem(
      TABLES.mediafiles, { projectId, fileId },
      'ADD likeCount :one', { ':one': 1 }
    ).catch(() => {})
    return NextResponse.json({ success: true, data: { liked: true } })
  } catch (err) {
    console.error('[moments like POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
