import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { resolveProjectForViewer, isOwnerOrAdmin } from '@/lib/studio/galleryMembers'
import { studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { deleteMomentsGalleryCascade } from '@/lib/studio/momentsDelete'
import type { MediaFile } from '@/types/studio'

// GET /studio/api/moments/events/[projectId] — event detail, for the owner
// OR an approved member (Phase 3) — resolveProjectForViewer handles both
// without leaking which case applies via the response shape, so a member
// who isn't yet approved (or was never invited) gets the same 404 an owner
// of some unrelated project would.
export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const resolved = await resolveProjectForViewer(auth, params.projectId)
    if (!resolved) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    return NextResponse.json({ success: true, data: resolved.project })
  } catch (err) {
    console.error('[moments/events/[projectId] GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

// PATCH /studio/api/moments/events/[projectId] — admin-only. Currently just
// the cover photo (from the mock's "edit cover" pencil on the gallery card),
// reusing the exact same coverPhotoFileId field/fallback-to-first-ready-photo
// pattern Studio Admin's "Set as Cover" already uses — never a fresh upload,
// always an existing photo already in this gallery.
export async function PATCH(req: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const resolved = await resolveProjectForViewer(auth, params.projectId)
    if (!resolved) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    if (!isOwnerOrAdmin(auth.studioId, resolved.project, resolved.member)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({})) as { coverPhotoFileId?: string | null }
    if (body.coverPhotoFileId === undefined) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    if (body.coverPhotoFileId === null) {
      await studioUpdateItem(TABLES.projects, { studioId: resolved.project.studioId, projectId: params.projectId }, 'REMOVE coverPhotoFileId', {})
    } else {
      const file = await studioGetItem<MediaFile>(TABLES.mediafiles, { projectId: params.projectId, fileId: body.coverPhotoFileId })
      if (!file) return NextResponse.json({ success: false, error: 'FILE_NOT_FOUND' }, { status: 404 })
      await studioUpdateItem(
        TABLES.projects,
        { studioId: resolved.project.studioId, projectId: params.projectId },
        'SET coverPhotoFileId = :cover',
        { ':cover': body.coverPhotoFileId }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[moments/events/[projectId] PATCH]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

// DELETE /studio/api/moments/events/[projectId] — owner-only (deliberately
// stricter than the isOwnerOrAdmin check every other admin action in this
// surface uses — a promoted admin can manage members/settings, but wiping
// the whole gallery for everyone is reserved for whoever actually created
// it). Irreversible: see deleteMomentsGalleryCascade for exactly what goes.
export async function DELETE(req: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const resolved = await resolveProjectForViewer(auth, params.projectId)
    if (!resolved) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    if (auth.studioId !== resolved.project.studioId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    await deleteMomentsGalleryCascade(resolved.project.studioId, params.projectId)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[moments/events/[projectId] DELETE]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
