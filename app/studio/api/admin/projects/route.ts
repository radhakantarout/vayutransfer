import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioPutItem, studioQueryByPK, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject } from '@/types/studio'

// GET /studio/api/admin/projects — list all projects for this studio
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const studioId = auth.studioId ?? req.nextUrl.searchParams.get('studioId')
    if (!studioId) {
      return NextResponse.json({ success: false, error: 'MISSING_STUDIO_ID' }, { status: 400 })
    }

    const projects = await studioQueryByPK<StudioProject>(TABLES.projects, 'studioId', studioId)
    // Defensive — a malformed/incomplete project record missing updatedAt
    // would otherwise throw here and take down the whole studio's list.
    projects.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))

    return NextResponse.json({ success: true, data: projects })
  } catch (err) {
    console.error('[admin/projects GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

// POST /studio/api/admin/projects — create project
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const studioId = auth.studioId ?? body.studioId
    const { clientName, clientEmail, clientPhone, eventDate, eventType, eventLocation } = body

    if (!studioId || !clientName) {
      return NextResponse.json(
        { success: false, error: 'INVALID_INPUT', message: 'clientName is required' },
        { status: 400 }
      )
    }

    // New Project creation (from /projects/new) sends no eventDate — this
    // creates a placeholder "client shell" with no real event yet, promoted
    // in place by AddEventModal the first time a real event is added. The
    // AddEventModal path always sends eventDate and creates a real event.
    const isPlaceholder = !eventDate

    const now = new Date().toISOString()
    const project: StudioProject = {
      studioId,
      projectId: randomUUID(),
      clientName,
      clientEmail: clientEmail ?? '',
      clientPhone: clientPhone ?? '',
      eventDate: eventDate ?? '',
      // Event type is chosen per-event (e.g. via "+ Add event"), not at
      // project-creation time — defaults to OTHER, editable later.
      eventType: eventType ?? 'OTHER',
      ...(eventLocation ? { eventLocation } : {}),
      ...(isPlaceholder ? { isPlaceholder: true } : {}),
      status: 'DRAFT',
      totalFiles: 0,
      selectedFilesCount: 0,
      editingRequiredCount: 0,
      commentsCount: 0,
      createdAt: now,
      updatedAt: now,
    }

    await studioPutItem(TABLES.projects, project as unknown as Record<string, unknown>)

    // Increment studio projectCount
    await studioUpdateItem(
      TABLES.studios,
      { studioId },
      'ADD projectCount :one SET updatedAt = :now',
      { ':one': 1, ':now': now }
    )

    return NextResponse.json({ success: true, data: { projectId: project.projectId } }, { status: 201 })
  } catch (err) {
    console.error('[admin/projects POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
