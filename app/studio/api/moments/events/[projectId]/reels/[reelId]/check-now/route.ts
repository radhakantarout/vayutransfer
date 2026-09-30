import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { getStudioR2SignedDownloadUrl } from '@/lib/studio/r2'
import { resolveProjectForViewer, isOwnerOrApprovedMember } from '@/lib/studio/galleryMembers'
import { reelJobProgress } from '@/lib/studio/reelProgress'
import { checkAndAdvanceReelJob } from '@/lib/studio/reelCheck'
import type { StudioJob, StudioReel } from '@/types/studio'

// User-triggered escape hatch for a reel stuck on "generating"/"assembling"
// — runs the exact same claim/finalize/refund logic cron/reel-check does,
// for just this one reel, on demand. Built 2026-09-30 after confirming
// production's periodic reel-check trigger was never actually wired to a
// real recurring schedule, so nothing was re-asking Kling once a reel's
// clips finished — a user had no way to recover other than someone manually
// curling the cron route. This makes "did Kling finish?" self-serve.
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string; reelId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId, reelId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved || !isOwnerOrApprovedMember(auth.studioId, resolved.project, resolved.member)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const reel = await studioGetItem<StudioReel>(TABLES.reels, { reelId })
    if (!reel || reel.projectId !== projectId || reel.studioId !== resolved.project.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    if (reel.status === 'generating' || reel.status === 'assembling') {
      const job = await studioGetItem<StudioJob>(TABLES.jobs, { jobId: reel.jobId })
      if (job) await checkAndAdvanceReelJob(job, reel)
    }

    const fresh = (await studioGetItem<StudioReel>(TABLES.reels, { reelId })) ?? reel
    const outputUrl = fresh.status === 'completed' && fresh.outputR2Key
      ? await getStudioR2SignedDownloadUrl(fresh.outputR2Key, `reel-${reelId}.mp4`, 3600)
      : null
    const progress = fresh.status === 'generating' ? await reelJobProgress(fresh.jobId) : null

    return NextResponse.json({
      success: true,
      data: { status: fresh.status, outputUrl, errorMessage: fresh.errorMessage ?? null, progress },
    })
  } catch (err) {
    console.error('[moments reel check-now]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
