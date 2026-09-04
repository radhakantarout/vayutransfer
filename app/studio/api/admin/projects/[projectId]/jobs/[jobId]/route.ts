import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject, StudioJob } from '@/types/studio'

// Generic StudioJob status read, shared by every job type that needs simple
// polling (WATERMARK, INDEX_FACES) instead of each type growing its own
// bespoke status route — the two that already existed before this
// (faces/route.ts, print gallery's download-all/status/[jobId]) both do the
// same "get StudioJob, shape a small subset of it" work; this is that same
// shape, generalized and scoped to the studio-admin auth model.
export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string; jobId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId, jobId } = params
    const studioId = auth.studioId!

    const project = await studioGetItem<StudioProject>(TABLES.projects, { studioId, projectId })
    if (!project) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    const job = await studioGetItem<StudioJob>(TABLES.jobs, { jobId })
    if (!job || job.projectId !== projectId || job.studioId !== studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: {
        status: job.status,
        outputPayload: job.outputPayload ?? {},
        errorMessage: job.errorMessage ?? null,
      },
    })
  } catch (err) {
    console.error('[admin project job status GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
