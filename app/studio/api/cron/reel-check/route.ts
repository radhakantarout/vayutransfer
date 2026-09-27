import { NextRequest, NextResponse } from 'next/server'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { studioQueryByIndex, studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { checkReelClipStatuses } from '@/lib/studio/videoProviders'
import { refundReelCredits, refundAiSearchCredits } from '@/lib/studio/billing'
import { REEL_ASPECT_RATIO_DIMENSIONS } from '@/constants/videoProviders'
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
// Not wired into any real EventBridge schedule yet — this route existing and
// being manually triggerable is what Phase 2 needs; the actual ~1/min
// trigger is a separate, explicit-go-ahead AWS resource (task #388).

const lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  const query = req.nextUrl.searchParams.get('secret')
  return auth === `Bearer ${secret}` || query === secret
}

async function failAndRefund(job: StudioJob, reel: StudioReel, message: string) {
  const now = new Date().toISOString()
  await studioUpdateItem(
    TABLES.jobs, { jobId: job.jobId },
    'SET #s = :failed, errorMessage = :msg, completedAt = :now',
    { ':failed': 'FAILED', ':msg': message, ':now': now },
    { '#s': 'status' }
  ).catch((e) => console.error('[reel-check] job fail update failed', job.jobId, e))

  await studioUpdateItem(
    TABLES.reels, { reelId: reel.reelId },
    'SET #s = :failed, errorMessage = :msg, completedAt = :now',
    { ':failed': 'failed', ':msg': message, ':now': now },
    { '#s': 'status' }
  ).catch((e) => console.error('[reel-check] reel fail update failed', reel.reelId, e))

  if (reel.creditsCharged) {
    // Moments reels spend from the shared aiSearchCredits pool, Client
    // Gallery/Guest reels from the separate reelCreditsBalance pool — same
    // split cron/storage-check's own stuck-job sweep already relies on.
    const refund = reel.source === 'MOMENTS' ? refundAiSearchCredits : refundReelCredits
    await refund(job.studioId, reel.creditsCharged).catch((e) => console.error('[reel-check] refund failed', reel.reelId, e))
  }
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
    // No providerJobIds/provider means this job predates the async redesign
    // (created by the legacy Lambda-does-everything path, which manages its
    // own status transitions) — never touch it here, that's what
    // cron/storage-check's own stuck-job sweep still covers.
    if (!reel || !reel.provider || !reel.providerJobIds?.length) { skipped++; continue }
    if (reel.status === 'completed' || reel.status === 'failed') { skipped++; continue }

    let statuses
    try {
      statuses = await checkReelClipStatuses({ providerName: reel.provider, providerJobIds: reel.providerJobIds })
    } catch (err) {
      console.error('[reel-check] status check threw for reel', reelId, err)
      stillGenerating++
      continue
    }

    const values = reel.providerJobIds.map((id) => statuses[id])
    const anyFailed = values.some((s) => s?.status === 'failed')
    const allCompleted = values.every((s) => s?.status === 'completed')

    if (anyFailed) {
      // Same race as the success path below (two overlapping check runs can
      // both see a failed clip for the same job) — without this conditional
      // transition, both would call failAndRefund and double-refund the
      // studio's wallet. Losing the race here is not an error, just means
      // the other run already handles (or already handled) this failure.
      try {
        await studioUpdateItem(
          TABLES.jobs, { jobId: job.jobId },
          'SET #s = :failing, updatedAt = :now',
          { ':failing': 'FINALIZING', ':processing': 'PROCESSING', ':now': new Date().toISOString() },
          { '#s': 'status' },
          '#s = :processing'
        )
      } catch (err) {
        if ((err as { name?: string })?.name !== 'ConditionalCheckFailedException') {
          console.error('[reel-check] unexpected error claiming failed job for refund', job.jobId, err)
        }
        skipped++
        continue
      }
      const firstError = values.find((s) => s?.status === 'failed')?.errorMessage
      await failAndRefund(job, reel, firstError || 'Clip generation failed')
      failedCount++
      continue
    }

    if (!allCompleted) {
      await studioUpdateItem(
        TABLES.jobs, { jobId: job.jobId },
        'SET outputPayload = :p, updatedAt = :now',
        { ':p': { stage: 'generating', processed: values.filter((s) => s?.status === 'completed').length, total: values.length }, ':now': new Date().toISOString() }
      ).catch((e) => console.error('[reel-check] progress update failed', reelId, e))
      stillGenerating++
      continue
    }

    // Every clip succeeded — conditionally move PROCESSING -> FINALIZING
    // before invoking the Lambda's finalize path. The condition means a
    // second, overlapping check run that also sees this job as "all done"
    // loses the race here and just skips it (ConditionalCheckFailedException),
    // rather than both runs invoking finalize for the same reel.
    try {
      await studioUpdateItem(
        TABLES.jobs, { jobId: job.jobId },
        'SET #s = :finalizing, updatedAt = :now',
        { ':finalizing': 'FINALIZING', ':processing': 'PROCESSING', ':now': new Date().toISOString() },
        { '#s': 'status' },
        '#s = :processing'
      )
    } catch (err) {
      if ((err as { name?: string })?.name !== 'ConditionalCheckFailedException') {
        console.error('[reel-check] unexpected error claiming job for finalize', job.jobId, err)
      }
      skipped++ // ConditionalCheckFailedException = lost the race to another check run, not an error
      continue
    }

    await studioUpdateItem(
      TABLES.reels, { reelId }, 'SET #s = :assembling',
      { ':assembling': 'assembling' }, { '#s': 'status' }
    ).catch((e) => console.error('[reel-check] reel assembling update failed', reelId, e))

    const clipUrls = reel.providerJobIds.map((id) => statuses[id]?.outputUrl).filter((u): u is string => !!u)
    if (clipUrls.length !== reel.providerJobIds.length) {
      // Shouldn't happen (allCompleted already checked every status), but
      // never hand the Lambda a shorter list than it thinks it's getting.
      await failAndRefund(job, reel, 'One or more completed clips had no output URL')
      failedCount++
      continue
    }

    if (!process.env.REEL_LAMBDA_ARN) {
      console.error('[reel-check] REEL_LAMBDA_ARN not set, cannot finalize', reelId)
      await failAndRefund(job, reel, 'Could not finalize generation')
      failedCount++
      continue
    }

    try {
      await lambda.send(new InvokeCommand({
        FunctionName: process.env.REEL_LAMBDA_ARN,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({
          jobId: job.jobId, reelId, studioId: job.studioId,
          mode: 'finalize',
          clipUrls,
          // Photo-style (concat+crop) vs text-style (passthrough) — same
          // discriminator the Lambda's finalize branch itself uses.
          // aspectRatio's '1:1' variant only ever appears on mode:'text'
          // reels (see the comment on ReelAspectRatio in types/studio.ts) —
          // the cast is safe precisely because this branch already excludes
          // that case.
          targetDimensions: reel.mode === 'text' ? undefined : REEL_ASPECT_RATIO_DIMENSIONS[reel.aspectRatio as '9:16' | '4:5' | '16:9'],
          r2Bucket: process.env.STUDIO_R2_ORIGINAL_BUCKET,
          r2Endpoint: process.env.STUDIO_R2_ENDPOINT,
          r2AccessKeyId: process.env.STUDIO_R2_ORIGINAL_ACCESS_KEY_ID,
          r2SecretAccessKey: process.env.STUDIO_R2_ORIGINAL_SECRET_ACCESS_KEY,
          creditsCharged: reel.creditsCharged,
          refundPool: reel.source === 'MOMENTS' ? 'aiSearchCredits' : 'reelCredits',
        })),
      }))
      advanced++
    } catch (err) {
      console.error('[reel-check] finalize invoke failed', reelId, err)
      await failAndRefund(job, reel, 'Could not finalize generation')
      failedCount++
    }
  }

  return NextResponse.json({ success: true, data: { checked: jobs.length, advanced, failed: failedCount, stillGenerating, skipped } })
}
