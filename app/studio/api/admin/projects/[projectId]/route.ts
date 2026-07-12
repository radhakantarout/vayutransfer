import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import {
  studioGetItem,
  studioUpdateItem,
  TABLES,
} from '@/lib/studio/dynamodb'
import { deleteProjectCascade } from '@/lib/studio/projectDelete'
import type { StudioProject, MediaFile } from '@/types/studio'

// PATCH /studio/api/admin/projects/[projectId] — edit project details, or
// (as a standalone lightweight update) set the event's cover photo
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
    const { clientName, clientEmail, clientPhone, eventDate, eventType, eventLocation, coverPhotoFileId, isStarred, scheduledDeleteAt } = body

    // Set-cover-photo, set-starred, and set-scheduled-delete are separate,
    // smaller updates — don't require the full edit-details fields to also
    // be present.
    if ((coverPhotoFileId !== undefined || isStarred !== undefined || scheduledDeleteAt !== undefined) && clientName === undefined) {
      const project = await studioGetItem<StudioProject>(TABLES.projects, { studioId: auth.studioId, projectId })
      if (!project) {
        return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
      }
      if (coverPhotoFileId !== undefined && coverPhotoFileId !== null) {
        const file = await studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId: coverPhotoFileId })
        if (!file || file.studioId !== auth.studioId) {
          return NextResponse.json({ success: false, error: 'NOT_FOUND', message: 'Photo not found in this event' }, { status: 404 })
        }
      }

      const now = new Date().toISOString()
      const updates: string[] = ['updatedAt = :now']
      const removes: string[] = []
      const values: Record<string, unknown> = { ':now': now }

      if (coverPhotoFileId !== undefined) {
        if (coverPhotoFileId === null) {
          removes.push('coverPhotoFileId')
        } else {
          updates.push('coverPhotoFileId = :cover')
          values[':cover'] = coverPhotoFileId
        }
      }
      if (isStarred !== undefined) {
        updates.push('isStarred = :starred')
        values[':starred'] = isStarred
      }
      if (scheduledDeleteAt !== undefined) {
        if (scheduledDeleteAt === null) {
          removes.push('scheduledDeleteAt')
        } else {
          updates.push('scheduledDeleteAt = :sched')
          values[':sched'] = scheduledDeleteAt
        }
      }

      const expression = removes.length > 0
        ? `SET ${updates.join(', ')} REMOVE ${removes.join(', ')}`
        : `SET ${updates.join(', ')}`

      await studioUpdateItem(TABLES.projects, { studioId: auth.studioId, projectId }, expression, values)
      return NextResponse.json({ success: true, data: { projectId } })
    }

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

    await deleteProjectCascade(auth.studioId!, projectId)

    return NextResponse.json({ success: true, data: { projectId } })
  } catch (err) {
    console.error('[admin project DELETE]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
