import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioPutItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { resolveProjectForViewer, isOwnerOrAdmin } from '@/lib/studio/galleryMembers'
import { attemptReclaimReelClips } from '@/lib/studio/videoProviders'
import { invokeReelFinalizeLambda } from '@/lib/studio/reelFinalize'
import type { StudioJob, StudioReel } from '@/types/studio'

// Reel-reclaim quick fix — see the Client Gallery equivalent's header comment
// for the full rationale. Auth/permission checks mirror the existing Moments
// POST .../reels route's own creation gate (same bar as creating a reel at
// all — allowMemberReels applies here too, since a successful reclaim still
// creates a new reel/job pair, even though it costs nothing).
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string; reelId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId, reelId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    const { project, member } = resolved
    const studioId = project.studioId

    if (!isOwnerOrAdmin(auth.studioId, project, member) && !project.allowMemberReels) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN', message: 'The gallery owner hasn\'t turned on Reels for members yet.' }, { status: 403 })
    }

    const oldReel = await studioGetItem<StudioReel>(TABLES.reels, { reelId })
    if (!oldReel || oldReel.projectId !== projectId || oldReel.studioId !== studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    if (oldReel.status !== 'failed' || (oldReel.mode && oldReel.mode !== 'photo') || !oldReel.provider || oldReel.photoIds.length === 0) {
      return NextResponse.json({ success: true, data: { reclaimed: false } })
    }

    const result = await attemptReclaimReelClips({
      reelId: oldReel.reelId, photoIds: oldReel.photoIds, providerName: oldReel.provider,
    })
    if (!result.reclaimed) {
      // Deliberately claims NOTHING here — a transient Kling status-check
      // hiccup must not permanently burn this reel's one shot at a free
      // reclaim. A later retry (another Regenerate click) can still succeed.
      return NextResponse.json({ success: true, data: { reclaimed: false } })
    }

    // Claim this specific reel for reclaim, once, ONLY now that Kling has
    // confirmed every clip is genuinely done — see the Client Gallery
    // equivalent's comment for why this ordering closes the real race.
    try {
      await studioUpdateItem(
        TABLES.reels, { reelId }, 'SET reclaimedAt = :now',
        { ':now': new Date().toISOString() }, undefined, 'attribute_not_exists(reclaimedAt)'
      )
    } catch (err) {
      if ((err as { name?: string })?.name !== 'ConditionalCheckFailedException') {
        console.error('[moments reels reclaim] unexpected error claiming reel for reclaim', reelId, err)
      }
      return NextResponse.json({ success: true, data: { reclaimed: false } })
    }

    const newReelId = randomUUID()
    const newJobId = randomUUID()
    const now = new Date().toISOString()
    const ttl = Math.floor(Date.now() / 1000) + 24 * 60 * 60

    const newReel: StudioReel = {
      ...oldReel,
      reelId: newReelId, jobId: newJobId,
      status: 'assembling',
      creditsCharged: 0,
      errorMessage: undefined,
      completedAt: undefined,
      outputR2Key: undefined,
      createdAt: now,
    }
    await studioPutItem(TABLES.reels, newReel as unknown as Record<string, unknown>)

    const newJob: StudioJob = {
      jobId: newJobId, jobType: 'AI_REEL', status: 'FINALIZING',
      projectId, studioId,
      inputPayload: { reelId: newReelId, photoCount: oldReel.photoIds.length, reclaimedFromReelId: oldReel.reelId },
      outputPayload: { stage: 'finalizing', processed: 0, total: oldReel.photoIds.length },
      createdAt: now, ttl,
    }
    await studioPutItem(TABLES.jobs, newJob as unknown as Record<string, unknown>)

    try {
      await invokeReelFinalizeLambda({
        jobId: newJobId, reelId: newReelId, studioId,
        clipUrls: result.clipUrls, aspectRatio: oldReel.aspectRatio, mode: oldReel.mode,
      })
    } catch (err) {
      console.error('[moments reels reclaim] finalize invoke failed', err)
      const failedAt = new Date().toISOString()
      await studioUpdateItem(TABLES.jobs, { jobId: newJobId }, 'SET #s = :failed, errorMessage = :msg, completedAt = :now', { ':failed': 'FAILED', ':msg': 'Could not finalize reclaimed video', ':now': failedAt }, { '#s': 'status' })
      await studioUpdateItem(TABLES.reels, { reelId: newReelId }, 'SET #s = :failed, errorMessage = :msg, completedAt = :now', { ':failed': 'failed', ':msg': 'Could not finalize reclaimed video', ':now': failedAt }, { '#s': 'status' })
      // This failure is an AWS/Lambda-invoke problem, not a Kling one — roll
      // back the claim on the OLD reel so a later retry can still succeed.
      await studioUpdateItem(TABLES.reels, { reelId }, 'REMOVE reclaimedAt', {}).catch((e) =>
        console.error('[moments reels reclaim] failed to roll back reclaim claim', reelId, e)
      )
      return NextResponse.json({ success: true, data: { reclaimed: false } })
    }

    return NextResponse.json({ success: true, data: { reclaimed: true, reelId: newReelId, jobId: newJobId } })
  } catch (err) {
    console.error('[moments reels reclaim]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
