import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { getStudioR2SignedDownloadUrl } from '@/lib/studio/r2'
import { resolveProjectForViewer, isOwnerOrApprovedMember } from '@/lib/studio/galleryMembers'
import type { StudioReel } from '@/types/studio'

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string; reelId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId, reelId } = params
    // Was previously checking reel.studioId !== auth.studioId directly — a
    // promoted (non-owner) admin/member's own personal studioId is never
    // the same as the project owner's, so this failed closed for anyone but
    // the original creator. resolveProjectForViewer is the same uniform
    // membership check every other Moments route already uses.
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved || !isOwnerOrApprovedMember(auth.studioId, resolved.project, resolved.member)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const reel = await studioGetItem<StudioReel>(TABLES.reels, { reelId })
    if (!reel || reel.projectId !== projectId || reel.studioId !== resolved.project.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const outputUrl = reel.status === 'completed' && reel.outputR2Key
      ? await getStudioR2SignedDownloadUrl(reel.outputR2Key, `reel-${reelId}.mp4`, 3600)
      : null

    return NextResponse.json({
      success: true,
      data: { status: reel.status, outputUrl, errorMessage: reel.errorMessage ?? null },
    })
  } catch (err) {
    console.error('[moments reel status GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
