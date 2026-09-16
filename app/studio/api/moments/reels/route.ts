import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByPK, studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject, StudioReel } from '@/types/studio'

// Cross-gallery "where did my credits go" activity feed for Moments'
// Profile screen — StudioReel has no studioId-based GSI (only
// projectId-createdAt-index), so a real cross-gallery query means fetching
// this account's own galleries first (cheap, PK-indexed on TABLES.projects)
// then querying reels per-project via the existing GSI, never a full-table
// scan. Bounded by how many galleries one personal account actually has —
// fine at Moments' scale, not something Studio Admin needs (a real studio's
// own reel history is already visible per-gallery there).
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const projects = await studioQueryByPK<StudioProject>(TABLES.projects, 'studioId', auth.studioId)
    const ownGalleries = projects.filter((p) => p.isIndividualGallery === true)

    const reelLists = await Promise.all(
      ownGalleries.map((p) =>
        studioQueryByIndex<StudioReel>(TABLES.reels, 'projectId-createdAt-index', 'projectId = :p', { ':p': p.projectId })
          .catch(() => [] as StudioReel[])
      )
    )
    const galleryNameByProjectId = new Map(ownGalleries.map((p) => [p.projectId, p.clientName]))

    const data = reelLists
      .flat()
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .slice(0, 15)
      .map((r) => ({
        reelId: r.reelId,
        galleryName: galleryNameByProjectId.get(r.projectId) ?? 'Gallery',
        photoCount: r.photoIds?.length ?? 0,
        durationSec: r.durationSec,
        status: r.status,
        creditsCharged: r.creditsCharged ?? 0,
        createdAt: r.createdAt,
        errorMessage: r.errorMessage ?? null,
      }))

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[moments reels activity GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
