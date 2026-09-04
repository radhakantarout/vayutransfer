import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject, StudioJob } from '@/types/studio'

// Generic cancel for any pollable StudioJob (WATERMARK, INDEX_FACES). Only
// flips PENDING/PROCESSING → CANCELLED — a job that already reached a
// terminal status is left alone rather than erroring, since the client may
// race a cancel click against the job's own last poll.
//
// What actually stops depends on the job type: INDEX_FACES's Lambda loops
// sequentially and checks this flag between photos, so this is a real
// cancel there. WATERMARK fires one independent Lambda invoke per file with
// no shared state — this only stops new progress from being counted/
// reported; any invocations already in flight finish quietly in the
// background (see lambda/vayustudio-watermark/index.js's bumpJobProgress,
// which no-ops once the job is no longer PROCESSING).
export async function POST(
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

    try {
      await studioUpdateItem(
        TABLES.jobs, { jobId },
        'SET #s = :cancelled, completedAt = :now',
        { ':cancelled': 'CANCELLED', ':now': new Date().toISOString(), ':pending': 'PENDING', ':processing': 'PROCESSING' },
        { '#s': 'status' },
        '#s = :pending OR #s = :processing'
      )
    } catch {
      // Already terminal (READY/FAILED/CANCELLED) — nothing to do, not an error.
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[job cancel POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
