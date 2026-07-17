import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioPutItem, studioQueryByPK, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject, StudioFace, MediaFile } from '@/types/studio'

// Admin-curated photo groups ("this is one person's photos") — the admin
// builds these by selfie-searching + adjusting a selection, then saving it
// here. `faceId` doubles as a generic group id (crypto.randomUUID()), not an
// actual Rekognition FaceId — no automatic clustering happens anywhere.
export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId } = params
    const studioId = auth.studioId!
    const project = await studioGetItem<StudioProject>(TABLES.projects, { studioId, projectId })
    if (!project) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    const groups = await studioQueryByPK<StudioFace>(TABLES.faces, 'projectId', projectId)
    groups.sort((a, b) => b.photoCount - a.photoCount)

    return NextResponse.json({ success: true, data: groups })
  } catch (err) {
    console.error('[faces/groups GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId } = params
    const studioId = auth.studioId!
    const project = await studioGetItem<StudioProject>(TABLES.projects, { studioId, projectId })
    if (!project) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    const { photoIds } = await req.json().catch(() => ({}))
    if (!Array.isArray(photoIds) || photoIds.length === 0) {
      return NextResponse.json({ success: false, error: 'NO_PHOTOS' }, { status: 400 })
    }

    const dedupedIds = Array.from(new Set(photoIds)) as string[]
    const cover = await studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId: dedupedIds[0] })

    const now = new Date().toISOString()
    const group: StudioFace = {
      projectId,
      faceId: crypto.randomUUID(),
      studioId,
      photoIds: dedupedIds,
      photoCount: dedupedIds.length,
      confidence: 100,
      thumbnailR2Key: cover?.r2Key ?? '',
      thumbnailUrl: cover?.r2PreviewUrl ?? '',
      createdAt: now,
      updatedAt: now,
    }
    await studioPutItem(TABLES.faces, group as unknown as Record<string, unknown>)

    return NextResponse.json({ success: true, data: group })
  } catch (err) {
    console.error('[faces/groups POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
