import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { getStudioR2SignedDownloadUrl } from '@/lib/studio/r2'
import type { StudioReel } from '@/types/studio'

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string; reelId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId, reelId } = params
    const reel = await studioGetItem<StudioReel>(TABLES.reels, { reelId })
    if (!reel || reel.projectId !== projectId || reel.studioId !== auth.studioId) {
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
