import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByPK, TABLES } from '@/lib/studio/dynamodb'
import { resolveProjectForViewer, isApprovedMember, isOwnerOrAdmin } from '@/lib/studio/galleryMembers'
import type { GalleryLike } from '@/types/studio'

// GET — who liked this photo/video, newest first. Any approved member can
// see this (same "liked by" attribution WhatsApp/Instagram-style apps show).
export async function GET(
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

    const likes = await studioQueryByPK<GalleryLike>(TABLES.galleryLikes, 'fileId', fileId)
    likes.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))

    return NextResponse.json({ success: true, data: likes.map((l) => ({ userId: l.userId, name: l.name ?? 'Someone' })) })
  } catch (err) {
    console.error('[moments likes GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
