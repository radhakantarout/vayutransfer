import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByPK, studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import type { Selection, StudioProject } from '@/types/studio'

async function resolveProjectId(auth: { projectId?: string; studioId?: string }, requestedId?: string): Promise<string | null> {
  if (!requestedId) return auth.projectId ?? null
  // Validate cross-project access: must be same client email + studio
  const [entryProject, requestedProject] = await Promise.all([
    studioGetItem<StudioProject>(TABLES.projects, { studioId: auth.studioId!, projectId: auth.projectId! }),
    studioGetItem<StudioProject>(TABLES.projects, { studioId: auth.studioId!, projectId: requestedId }),
  ])
  if (!entryProject || !requestedProject) return null
  if (entryProject.clientEmail !== requestedProject.clientEmail) return null
  return requestedId
}

// GET — load all selections for a project
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'CLIENT') {
      return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 })
    }

    const reqProjectId = new URL(req.url).searchParams.get('projectId') ?? undefined
    const projectId = await resolveProjectId(auth, reqProjectId)
    if (!projectId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const selections = await studioQueryByPK<Selection>(TABLES.selections, 'projectId', projectId)
    return NextResponse.json({ success: true, data: selections })
  } catch (err) {
    console.error('[selections GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
