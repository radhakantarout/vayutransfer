import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioPutItem, studioQueryByPK, studioQueryByIndex, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { createOwnerMembership } from '@/lib/studio/galleryMembers'
import { getMediaPreviewUrl } from '@/lib/studio/storage'
import type { StudioProject, StudioUser, GalleryMember, MediaFile, StudioReel } from '@/types/studio'

// Cover photo respects an admin-chosen coverPhotoFileId (from the gallery
// card's "edit cover" pencil) when set, same fallback-to-first-ready-photo
// pattern StudioProject.coverPhotoFileId already uses elsewhere in this
// codebase — falls back cleanly if unset or the chosen file was deleted.
async function resolveCoverPhotoUrl(project: StudioProject, files: MediaFile[]): Promise<string | null> {
  const ready = files.filter((f) => f.processingStatus === 'READY').sort((a, b) => a.displayOrder - b.displayOrder)
  const chosen = project.coverPhotoFileId ? ready.find((f) => f.fileId === project.coverPhotoFileId) : undefined
  const pick = chosen ?? ready[0]
  if (!pick) return null
  return (await getMediaPreviewUrl(pick).catch(() => undefined)) ?? null
}

// GET /studio/api/moments/events — this individual's own galleries, PLUS any
// gallery they've been approved into as a member elsewhere (Phase 3) — the
// invite link itself gets someone into a gallery, but without this they'd
// have no way back to it afterward except re-visiting that exact link.
// studioId always comes from the verified JWT, never a query param.
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const owned = await studioQueryByPK<StudioProject>(TABLES.projects, 'studioId', auth.studioId)
    const ownedIds = new Set(owned.map((p) => p.projectId))

    // The owner's own galleries also show up here (their creation-time
    // membership row lives under their own studioId) — filter those out,
    // `owned` above is already authoritative for them.
    const memberships = await studioQueryByIndex<GalleryMember>(
      TABLES.galleryMembers, 'userId-index', 'userId = :u', { ':u': auth.userId }
    ).catch(() => [] as GalleryMember[])
    const joinedMemberships = memberships.filter((m) => m.status === 'APPROVED' && !ownedIds.has(m.projectId))

    const joined = (await Promise.all(
      joinedMemberships.map((m) => studioGetItem<StudioProject>(TABLES.projects, { studioId: m.studioId, projectId: m.projectId }))
    )).filter((p): p is StudioProject => !!p)

    const events = [...owned, ...joined]
    events.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))

    const enriched = await Promise.all(events.map(async (e) => {
      const [files, members, reels] = await Promise.all([
        studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', e.projectId),
        studioQueryByPK<GalleryMember>(TABLES.galleryMembers, 'projectId', e.projectId),
        studioQueryByIndex<StudioReel>(TABLES.reels, 'projectId-createdAt-index', 'projectId = :p', { ':p': e.projectId }).catch(() => [] as StudioReel[]),
      ])
      const isAdmin = ownedIds.has(e.projectId) || members.find((m) => m.userId === auth.userId)?.role === 'ADMIN'
      return {
        ...e,
        coverPhotoUrl: await resolveCoverPhotoUrl(e, files),
        memberCount: members.filter((m) => m.status === 'APPROVED').length,
        photoCount: files.filter((f) => f.fileType === 'IMAGE').length,
        videoCount: files.filter((f) => f.fileType === 'VIDEO').length,
        reelCount: reels.length,
        isAdmin,
      }
    }))

    return NextResponse.json({ success: true, data: enriched })
  } catch (err) {
    console.error('[moments/events GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

// POST /studio/api/moments/events — create a quick event, name only (Phase 1
// scope per the design doc — no client contact fields, no event type/date
// picker; those stay meaningful for a studio's paying clients, not here).
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const body = await req.json().catch(() => ({})) as { name?: string }
    const name = body.name?.trim()
    if (!name || name.length < 2) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const project: StudioProject = {
      studioId: auth.studioId,
      projectId: randomUUID(),
      // Reuses the existing required clientName field as the event's own
      // display name — Moments events have no separate "client" concept.
      clientName: name,
      clientEmail: '',
      clientPhone: '',
      eventDate: '',
      eventType: 'OTHER',
      isIndividualGallery: true,
      status: 'ACTIVE',
      totalFiles: 0,
      selectedFilesCount: 0,
      editingRequiredCount: 0,
      commentsCount: 0,
      createdAt: now,
      updatedAt: now,
    }

    await studioPutItem(TABLES.projects, project as unknown as Record<string, unknown>)
    await studioUpdateItem(
      TABLES.studios,
      { studioId: auth.studioId },
      'ADD projectCount :one SET updatedAt = :now',
      { ':one': 1, ':now': now }
    )

    // The creator is always an approved admin of their own gallery — see
    // lib/studio/galleryMembers.ts's comment on why this makes "is this
    // caller an admin" one uniform check everywhere else.
    const creator = await studioGetItem<StudioUser>(TABLES.users, { userId: auth.userId })
    await createOwnerMembership(project.projectId, auth.studioId, auth.userId, creator?.name, creator?.email)

    return NextResponse.json({ success: true, data: { projectId: project.projectId } }, { status: 201 })
  } catch (err) {
    console.error('[moments/events POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
