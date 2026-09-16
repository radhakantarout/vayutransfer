import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioPutItem, studioDeleteItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { resolveProjectForViewer, isApprovedMember, isOwnerOrAdmin, checkAndBumpMemberRateLimit } from '@/lib/studio/galleryMembers'
import type { GalleryLike, MediaFile } from '@/types/studio'

function isConditionalCheckFailed(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'ConditionalCheckFailedException'
}

// POST — set like/unlike on a photo/video, by explicit client intent
// (`{ liked: boolean }`) rather than a server-side read-then-toggle.
// Previously this read the existing like row THEN branched on it — two
// concurrent requests (a fast double-tap, or a stale client retry racing a
// fresh one) could both read "not liked" and both take the like branch,
// double-incrementing likeCount with no way back via a single unlike. Every
// write below is now a single ConditionExpression-guarded Put/Delete with
// no preceding read — genuinely atomic and idempotent under concurrent
// requests, and a request that finds the target state already applied
// (ConditionalCheckFailedException) is treated as a harmless no-op rather
// than an error, so retries/races settle on the correct end state instead
// of double-counting. Any approved member (any role, including admins) can
// like — this is the "engage with the gallery" tier of access, not gated
// behind allowMemberDownloads/allowMemberReels.
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
    // galleryLikes is keyed by fileId alone — without this check, a member
    // of ANY gallery could like/unlike another gallery's file by passing
    // that gallery's fileId in the URL while projectId still points at
    // their own (and bump that other file's likeCount as a side effect).
    const file = await studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId })
    if (!file) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    if (!(await checkAndBumpMemberRateLimit(projectId, auth.userId))) {
      return NextResponse.json({ success: false, error: 'RATE_LIMITED' }, { status: 429 })
    }

    // Older clients (or a missing body) fall back to reading current state
    // and flipping it — kept only for backward compatibility, the new
    // client always sends its intent explicitly.
    const { liked: requestedLiked } = await req.json().catch(() => ({})) as { liked?: boolean }
    const liked = typeof requestedLiked === 'boolean'
      ? requestedLiked
      : !(await studioGetItem<GalleryLike>(TABLES.galleryLikes, { fileId, userId: auth.userId }))

    if (liked) {
      const like: GalleryLike = { fileId, userId: auth.userId, name: resolved.member?.name, createdAt: new Date().toISOString() }
      try {
        await studioPutItem(TABLES.galleryLikes, like as unknown as Record<string, unknown>, 'attribute_not_exists(fileId)')
      } catch (err) {
        if (!isConditionalCheckFailed(err)) throw err
        return NextResponse.json({ success: true, data: { liked: true } }) // already liked — no-op
      }
      await studioUpdateItem(TABLES.mediafiles, { projectId, fileId }, 'ADD likeCount :one', { ':one': 1 }).catch(() => {})
      return NextResponse.json({ success: true, data: { liked: true } })
    }

    try {
      await studioDeleteItem(TABLES.galleryLikes, { fileId, userId: auth.userId }, 'attribute_exists(fileId)')
    } catch (err) {
      if (!isConditionalCheckFailed(err)) throw err
      return NextResponse.json({ success: true, data: { liked: false } }) // already unliked — no-op
    }
    await studioUpdateItem(TABLES.mediafiles, { projectId, fileId }, 'ADD likeCount :neg', { ':neg': -1 }).catch(() => {})
    return NextResponse.json({ success: true, data: { liked: false } })
  } catch (err) {
    console.error('[moments like POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
