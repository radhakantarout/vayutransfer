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
    projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

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
    const { clientName, clientEmail, clientPhone, eventDate, eventType } = body

    if (!studioId || !clientName || !eventDate || !eventType) {
      return NextResponse.json(
        { success: false, error: 'INVALID_INPUT', message: 'clientName, eventDate, eventType are required' },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()
    const project: StudioProject = {
      studioId,
      projectId: randomUUID(),
      clientName,
      clientEmail: clientEmail ?? '',
      clientPhone: clientPhone ?? '',
      eventDate,
      eventType,
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
