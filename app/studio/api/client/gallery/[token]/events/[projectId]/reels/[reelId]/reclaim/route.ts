import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByIndex, studioGetItem, studioPutItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { attemptReclaimReelClips } from '@/lib/studio/videoProviders'
import { invokeReelFinalizeLambda } from '@/lib/studio/reelFinalize'
import type { StudioProject, StudioJob, StudioReel } from '@/types/studio'

// Reel-reclaim quick fix (2026-09, see reel-reclaim-quick-fix plan in
// memory) — before a client falls through to a full, freshly-billed
// regenerate, try to recover an already-Kling-completed video for the exact
// same clips via a free status re-check. Purely additive: never touched by
// the existing POST .../reels route, no credit deduction/refund of its own.
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string; projectId: string; reelId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth) return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 })

    const { token, projectId, reelId } = params
    const entryProjects = await studioQueryByIndex<StudioProject>(
      TABLES.projects, 'clientShareToken-index', 'clientShareToken = :token', { ':token': token }
    )
    const entry = entryProjects[0]
    const isClient = auth.role === 'CLIENT' && auth.projectId === entry?.projectId
    const isStudioPreview = !!entry && ['ADMIN', 'OWNER'].includes(auth.role) && auth.studioId === entry.studioId
    if (!entry || (!isClient && !isStudioPreview)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const oldReel = await studioGetItem<StudioReel>(TABLES.reels, { reelId })
    if (!oldReel || oldReel.projectId !== projectId || oldReel.studioId !== entry.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    // Only ever reclaim a genuinely failed, photo-mode reel — a completed
    // reel's Regenerate is a deliberate "give me a different result" request
    // (reclaiming would silently hand back the identical old video), and
    // text-mode has no deterministic id to reclaim by (see the plan doc).
    // Cheap short-circuit: no Kling calls at all for any of these cases.
    if (oldReel.status !== 'failed' || (oldReel.mode && oldReel.mode !== 'photo') || !oldReel.provider || oldReel.photoIds.length === 0) {
      return NextResponse.json({ success: true, data: { reclaimed: false } })
    }

    const result = await attemptReclaimReelClips({
      reelId: oldReel.reelId, photoIds: oldReel.photoIds, providerName: oldReel.provider,
    })
    if (!result.reclaimed) {
      // Deliberately claims NOTHING here — a transient Kling status-check
      // hiccup (surfaced as reclaimed:false, same as a genuine miss) must
      // not permanently burn this reel's one shot at a free reclaim. A later
      // retry (another Regenerate click) can still succeed.
      return NextResponse.json({ success: true, data: { reclaimed: false } })
    }

    // Claim this specific reel for reclaim, once, ONLY now that Kling has
    // confirmed every clip is genuinely done — closes the real race (two
    // overlapping requests both seeing reclaimed:true and both creating a
    // separate new reel/job for the same clips) at the one point it can
    // actually happen, without punishing the earlier failure branch above.
    try {
      await studioUpdateItem(
        TABLES.reels, { reelId }, 'SET reclaimedAt = :now',
        { ':now': new Date().toISOString() }, undefined, 'attribute_not_exists(reclaimedAt)'
      )
    } catch (err) {
      if ((err as { name?: string })?.name !== 'ConditionalCheckFailedException') {
        console.error('[client reels reclaim] unexpected error claiming reel for reclaim', reelId, err)
      }
      return NextResponse.json({ success: true, data: { reclaimed: false } })
    }

    // Never resurrect the old jobId/reelId — the reelgen Lambda's own
    // idempotency guard permanently blocks re-finalizing anything already
    // FAILED, so a fresh pair is the only way forward.
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
      jobId: newJobId, jobType: 'AI_REEL',
      // FINALIZING directly, not PROCESSING — there is nothing left to poll
      // from Kling, every clip is already known-complete.
      status: 'FINALIZING',
      projectId, studioId: entry.studioId,
      inputPayload: { reelId: newReelId, photoCount: oldReel.photoIds.length, reclaimedFromReelId: oldReel.reelId },
      outputPayload: { stage: 'finalizing', processed: 0, total: oldReel.photoIds.length },
      createdAt: now, ttl,
    }
    await studioPutItem(TABLES.jobs, newJob as unknown as Record<string, unknown>)

    try {
      await invokeReelFinalizeLambda({
        jobId: newJobId, reelId: newReelId, studioId: entry.studioId,
        clipUrls: result.clipUrls, aspectRatio: oldReel.aspectRatio, mode: oldReel.mode,
      })
    } catch (err) {
      console.error('[client reels reclaim] finalize invoke failed', err)
      const failedAt = new Date().toISOString()
      await studioUpdateItem(TABLES.jobs, { jobId: newJobId }, 'SET #s = :failed, errorMessage = :msg, completedAt = :now', { ':failed': 'FAILED', ':msg': 'Could not finalize reclaimed video', ':now': failedAt }, { '#s': 'status' })
      await studioUpdateItem(TABLES.reels, { reelId: newReelId }, 'SET #s = :failed, errorMessage = :msg, completedAt = :now', { ':failed': 'failed', ':msg': 'Could not finalize reclaimed video', ':now': failedAt }, { '#s': 'status' })
      // This failure is an AWS/Lambda-invoke problem, not a Kling one — the
      // underlying clips are still genuinely fine. Roll back the claim on
      // the OLD reel so a later retry can still succeed instead of
      // permanently burning its one free-reclaim shot over a transient
      // infra hiccup unrelated to whether the video actually exists.
      await studioUpdateItem(TABLES.reels, { reelId }, 'REMOVE reclaimedAt', {}).catch((e) =>
        console.error('[client reels reclaim] failed to roll back reclaim claim', reelId, e)
      )
      // Falls through as reclaimed:false — the frontend does a normal full
      // regenerate instead, same as if reclaim had never found anything.
      return NextResponse.json({ success: true, data: { reclaimed: false } })
    }

    return NextResponse.json({ success: true, data: { reclaimed: true, reelId: newReelId, jobId: newJobId } })
  } catch (err) {
    console.error('[client reels reclaim]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
