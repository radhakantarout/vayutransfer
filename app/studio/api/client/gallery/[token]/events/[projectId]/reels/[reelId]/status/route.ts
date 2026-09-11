import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByIndex, studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { getStudioR2SignedDownloadUrl } from '@/lib/studio/r2'
import type { StudioProject, StudioReel } from '@/types/studio'

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string; projectId: string; reelId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth) return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 })

    const { token, projectId, reelId } = params

    const entryProjects = await studioQueryByIndex<StudioProject>(
      TABLES.projects, 'clientShareToken-index', 'clientShareToken = :token', { ':token': token }
    )
    const entry = entryProjects[0]
    const isClient = auth.role === 'CLIENT' && auth.projectId === entry?.projectId
    const isStudioPreview = !!entry && ['ADMIN', 'OWNER'].includes(auth.role) && auth.studioId === entry.studioId
    if (!entry || (!isClient && !isStudioPreview)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const reel = await studioGetItem<StudioReel>(TABLES.reels, { reelId })
    if (!reel || reel.projectId !== projectId || reel.studioId !== entry.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    // Minted fresh on every read — never trust a previously-stored URL,
    // presigned links expire but the underlying R2 object doesn't. This is
    // what actually makes "My Reels" history durable long-term rather than
    // dying after whatever expiry a one-time link happened to get.
    const outputUrl = reel.status === 'completed' && reel.outputR2Key
      ? await getStudioR2SignedDownloadUrl(reel.outputR2Key, `reel-${reelId}.mp4`, 3600)
      : null

    return NextResponse.json({
      success: true,
      data: {
        status: reel.status,
        outputUrl,
        errorMessage: reel.errorMessage ?? null,
      },
    })
  } catch (err) {
    console.error('[client reel status GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
