import { NextRequest, NextResponse } from 'next/server'
import { studioQueryByIndex, studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { checkAndAdvanceReelJob } from '@/lib/studio/reelCheck'
import type { StudioJob, StudioReel } from '@/types/studio'

// Part of the async reelgen redesign (see reelgen-async-redesign-plan-2026-09
// in memory) — this is the periodic "advance in-flight reels" check that
// replaces the old design's single Lambda invocation holding the line open
// for the entire Kling generation + assembly. Meant to be hit ~once/minute
// by an external clock (AWS EventBridge Scheduler on the current Vercel
// Hobby plan — see the plan doc for why not a native Vercel cron), but is a
// plain protected route, not itself a registered Vercel cron job, so it can
// also just be curled manually during development (same pattern as
// cron/storage-check's `?secret=` fallback below).
//
// Confirmed 2026-09-30: this route's periodic trigger was NEVER actually
// provisioned in production (no real EventBridge schedule exists), which is
// why reels have repeatedly gotten stuck showing "generating" indefinitely
// despite Kling having finished within minutes — nothing was ever re-asking
// Kling. Rather than chase the EventBridge provisioning, the per-job core
// logic below was extracted to lib/studio/reelCheck.ts so a user-triggered
// on-demand check (reels/[reelId]/check-now) can self-heal a specific stuck
// reel without depending on this route ever running on a schedule at all.
// This route still exists for bulk/backfill use and manual curling.

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  const query = req.nextUrl.searchParams.get('secret')
  return auth === `Bearer ${secret}` || query === secret
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  const jobs = await studioQueryByIndex<StudioJob>(
    TABLES.jobs, 'jobType-status-index',
    'jobType = :t AND #s = :s',
    { ':t': 'AI_REEL', ':s': 'PROCESSING' },
    { '#s': 'status' }
  )

  let advanced = 0, failedCount = 0, stillGenerating = 0, skipped = 0

  for (const job of jobs) {
    const reelId = job.inputPayload?.reelId as string | undefined
    if (!reelId) { skipped++; continue }

    const reel = await studioGetItem<StudioReel>(TABLES.reels, { reelId })
    const outcome = await checkAndAdvanceReelJob(job, reel)
    if (outcome === 'advanced') advanced++
    else if (outcome === 'failed') failedCount++
    else if (outcome === 'still-generating') stillGenerating++
    else skipped++
  }

  return NextResponse.json({ success: true, data: { checked: jobs.length, advanced, failed: failedCount, stillGenerating, skipped } })
}
