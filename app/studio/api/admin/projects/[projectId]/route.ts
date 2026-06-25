import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import {
  studioGetItem,
  studioDeleteItem,
  studioUpdateItem,
  studioQueryByPK,
  TABLES,
} from '@/lib/studio/dynamodb'
import type { StudioProject, MediaFile, Selection } from '@/types/studio'

// PATCH /studio/api/admin/projects/[projectId] — edit project details
export async function PATCH(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId } = params
    const body = await req.json().catch(() => ({}))
    const { clientName, clientEmail, clientPhone, eventDate, eventType, eventLocation } = body

    if (!clientName || !eventDate || !eventType) {
      return NextResponse.json(
        { success: false, error: 'INVALID_INPUT', message: 'clientName, eventDate, eventType are required' },
        { status: 400 }
      )
    }

    const project = await studioGetItem<StudioProject>(TABLES.projects, {
      studioId: auth.studioId,
      projectId,
    })
    if (!project) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const now = new Date().toISOString()
    const hasLocation = typeof eventLocation === 'string' && eventLocation.trim().length > 0
    await studioUpdateItem(
      TABLES.projects,
      { studioId: auth.studioId, projectId },
      hasLocation
        ? 'SET clientName = :cn, clientEmail = :ce, clientPhone = :cp, eventDate = :ed, eventType = :et, eventLocation = :el, updatedAt = :now'
        : 'SET clientName = :cn, clientEmail = :ce, clientPhone = :cp, eventDate = :ed, eventType = :et, updatedAt = :now',
      hasLocation
        ? { ':cn': clientName, ':ce': clientEmail ?? '', ':cp': clientPhone ?? '', ':ed': eventDate, ':et': eventType, ':el': eventLocation.trim(), ':now': now }
        : { ':cn': clientName, ':ce': clientEmail ?? '', ':cp': clientPhone ?? '', ':ed': eventDate, ':et': eventType, ':now': now }
    )

    return NextResponse.json({ success: true, data: { projectId } })
  } catch (err) {
    console.error('[admin project PATCH]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

// DELETE /studio/api/admin/projects/[projectId] — delete project + all files/selections
export async function DELETE(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId } = params

    // Verify the project belongs to THIS studio — prevents cross-studio deletes
    const project = await studioGetItem<StudioProject>(TABLES.projects, {
      studioId: auth.studioId,
      projectId,
    })
    if (!project) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    // Fetch all child records
    const [mediafiles, selections] = await Promise.all([
      studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', projectId),
      studioQueryByPK<Selection>(TABLES.selections, 'projectId', projectId),
    ])

    // Delete all child records in parallel
    await Promise.all([
      ...mediafiles.map((f) =>
        studioDeleteItem(TABLES.mediafiles, { projectId, fileId: f.fileId })
      ),
      ...selections.map((s) =>
        studioDeleteItem(TABLES.selections, { projectId, fileId: s.fileId })
      ),
    ])

    // Delete the project itself
    await studioDeleteItem(TABLES.projects, { studioId: auth.studioId, projectId })

    // Decrement studio project count (floor at 0)
    const now = new Date().toISOString()
    await studioUpdateItem(
      TABLES.studios,
      { studioId: auth.studioId },
      'ADD projectCount :neg SET updatedAt = :now',
      { ':neg': -1, ':now': now }
    )

    return NextResponse.json({ success: true, data: { projectId } })
  } catch (err) {
    console.error('[admin project DELETE]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
