import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { getStudioR2SignedDownloadUrl } from '@/lib/studio/r2'
import type { StudioReel } from '@/types/studio'

function getSecret() {
  return new TextEncoder().encode(process.env.STUDIO_JWT_SECRET!)
}

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string; reelId: string } }
) {
  try {
    let projectId: string
    let studioId: string
    try {
      const { payload } = await jwtVerify(params.token, getSecret())
      if (payload.type !== 'GUEST_QR') {
        return NextResponse.json({ success: false, error: 'INVALID_TOKEN' }, { status: 401 })
      }
      projectId = payload.projectId as string
      studioId = payload.studioId as string
    } catch (err: unknown) {
      const name = (err as { name?: string }).name ?? ''
      if (name === 'JWTExpired') return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
      return NextResponse.json({ success: false, error: 'INVALID_TOKEN' }, { status: 401 })
    }

    const reel = await studioGetItem<StudioReel>(TABLES.reels, { reelId: params.reelId })
    if (!reel || reel.projectId !== projectId || reel.studioId !== studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const outputUrl = reel.status === 'completed' && reel.outputR2Key
      ? await getStudioR2SignedDownloadUrl(reel.outputR2Key, `reel-${params.reelId}.mp4`, 3600)
      : null

    return NextResponse.json({
      success: true,
      data: { status: reel.status, outputUrl, errorMessage: reel.errorMessage ?? null },
    })
  } catch (err) {
    console.error('[guest reel status GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
