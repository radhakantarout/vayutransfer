import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioDeleteItem, TABLES } from '@/lib/studio/dynamodb'
import { deleteStudioR2Object } from '@/lib/studio/r2'
import { resolveProjectForViewer, isOwnerOrAdmin } from '@/lib/studio/galleryMembers'
import type { StudioReel } from '@/types/studio'

// Lets a studio owner/admin clean up their own reel history — no delete
// path existed at all before this (2026-09-30, alongside the check-now
// recovery route). Deliberately owner/admin-only (a stricter bar than
// viewing reels), since deleting is destructive and members shouldn't be
// able to remove reels other members generated.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { projectId: string; reelId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId, reelId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved || !isOwnerOrAdmin(auth.studioId, resolved.project, resolved.member)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const reel = await studioGetItem<StudioReel>(TABLES.reels, { reelId })
    if (!reel || reel.projectId !== projectId || reel.studioId !== resolved.project.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    // Refuse to delete a reel still in flight — its Kling task may not have
    // finished yet, and deleting the record now would orphan a paid task
    // with nothing left to recover or refund it later (the same "orphaned
    // paid task" risk fixed elsewhere in reel creation this session).
    // Failed/completed reels are always safe to remove.
    if (reel.status === 'generating' || reel.status === 'assembling') {
      return NextResponse.json({ success: false, error: 'STILL_GENERATING', message: 'Wait for this reel to finish or fail before deleting it.' }, { status: 409 })
    }

    if (reel.outputR2Key) {
      await deleteStudioR2Object(reel.outputR2Key).catch((e) => console.error('[moments reel DELETE] R2 cleanup failed (continuing)', reelId, e))
    }
    await studioDeleteItem(TABLES.reels, { reelId })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[moments reel DELETE]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
