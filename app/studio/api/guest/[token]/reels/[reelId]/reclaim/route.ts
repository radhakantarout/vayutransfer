import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { randomUUID } from 'crypto'
import { studioGetItem, studioPutItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { attemptReclaimReelClips } from '@/lib/studio/videoProviders'
import { invokeReelFinalizeLambda } from '@/lib/studio/reelFinalize'
import type { StudioJob, StudioReel } from '@/types/studio'

function getSecret() {
  return new TextEncoder().encode(process.env.STUDIO_JWT_SECRET!)
}

// Reel-reclaim quick fix — see the Client Gallery equivalent's header comment
// for the full rationale (identical logic, this route only differs in auth
// mechanics, matching the Guest reels route's own GUEST_QR JWT pattern).
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string; reelId: string } }
) {
  try {
    let projectId: string
    let studioId: string
    try {
      const { payload } = await jwtVerify(params.token, getSecret())
      if (payload.type !== 'GUEST_QR') {
        return NextResponse.json({ success: false, error: 'INVALID_TOKEN' }, { status: 401 })
      }
      projectId = payload.projectId as string
      studioId = payload.studioId as string
    } catch (err: unknown) {
      const name = (err as { name?: string }).name ?? ''
      if (name === 'JWTExpired') return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
      return NextResponse.json({ success: false, error: 'INVALID_TOKEN' }, { status: 401 })
    }

    const oldReel = await studioGetItem<StudioReel>(TABLES.reels, { reelId: params.reelId })
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
        TABLES.reels, { reelId: params.reelId }, 'SET reclaimedAt = :now',
        { ':now': new Date().toISOString() }, undefined, 'attribute_not_exists(reclaimedAt)'
      )
    } catch (err) {
      if ((err as { name?: string })?.name !== 'ConditionalCheckFailedException') {
        console.error('[guest reels reclaim] unexpected error claiming reel for reclaim', params.reelId, err)
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
      inputPayload: { reelId: newReelId, photoCount: oldReel.photoIds.length, source: 'GUEST_SELFIE_SEARCH', reclaimedFromReelId: oldReel.reelId },
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
      console.error('[guest reels reclaim] finalize invoke failed', err)
      const failedAt = new Date().toISOString()
      await studioUpdateItem(TABLES.jobs, { jobId: newJobId }, 'SET #s = :failed, errorMessage = :msg, completedAt = :now', { ':failed': 'FAILED', ':msg': 'Could not finalize reclaimed video', ':now': failedAt }, { '#s': 'status' })
      await studioUpdateItem(TABLES.reels, { reelId: newReelId }, 'SET #s = :failed, errorMessage = :msg, completedAt = :now', { ':failed': 'failed', ':msg': 'Could not finalize reclaimed video', ':now': failedAt }, { '#s': 'status' })
      // This failure is an AWS/Lambda-invoke problem, not a Kling one — roll
      // back the claim on the OLD reel so a later retry can still succeed.
      await studioUpdateItem(TABLES.reels, { reelId: params.reelId }, 'REMOVE reclaimedAt', {}).catch((e) =>
        console.error('[guest reels reclaim] failed to roll back reclaim claim', params.reelId, e)
      )
      return NextResponse.json({ success: true, data: { reclaimed: false } })
    }

    return NextResponse.json({ success: true, data: { reclaimed: true, reelId: newReelId, jobId: newJobId } })
  } catch (err) {
    console.error('[guest reels reclaim]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
