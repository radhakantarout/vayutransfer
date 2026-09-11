import { NextRequest, NextResponse } from 'next/server'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { getStudioR2SignedDownloadUrl } from '@/lib/studio/r2'
import type { StudioReel } from '@/types/studio'

// Deliberately unauthenticated — no GUEST_QR token needed, just the reelId
// itself (a random UUID). This is the whole point: a guest shares this
// link to themselves (WhatsApp/Web Share) and can reopen it anytime with
// no login, matching the print-portal share-token pattern already used
// elsewhere in this codebase (security is "possession of an unguessable
// id," not a session).
//
// Scoped to source === 'GUEST_SELFIE_SEARCH' ONLY — this is the important
// guard. Without it, this route would become an unintended backdoor around
// the Client Gallery's own auth (verifyStudioJWT + clientEmail match):
// anyone who ever saw a client reel's id could view it with zero auth.
// Guest reels have no equivalent stricter access model to bypass, since
// they were already only ever gated by the (also unauthenticated-to-others)
// search-session check at creation time, not at view time.
export async function GET(
  _req: NextRequest,
  { params }: { params: { reelId: string } }
) {
  try {
    const reel = await studioGetItem<StudioReel>(TABLES.reels, { reelId: params.reelId })
    if (!reel || reel.source !== 'GUEST_SELFIE_SEARCH') {
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
    console.error('[guest reel share GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
