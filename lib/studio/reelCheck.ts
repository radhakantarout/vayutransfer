import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { checkReelClipStatuses } from '@/lib/studio/videoProviders'
import { refundReelCredits, refundAiSearchCredits } from '@/lib/studio/billing'
import { REEL_ASPECT_RATIO_DIMENSIONS } from '@/constants/videoProviders'
import type { StudioJob, StudioReel } from '@/types/studio'

const lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

export type ReelCheckOutcome = 'advanced' | 'failed' | 'still-generating' | 'skipped'

async function failAndRefund(job: StudioJob, reel: StudioReel, message: string) {
  const now = new Date().toISOString()
  await studioUpdateItem(
    TABLES.jobs, { jobId: job.jobId },
    'SET #s = :failed, errorMessage = :msg, completedAt = :now',
    { ':failed': 'FAILED', ':msg': message, ':now': now },
    { '#s': 'status' }
  ).catch((e) => console.error('[reelCheck] job fail update failed', job.jobId, e))

  await studioUpdateItem(
    TABLES.reels, { reelId: reel.reelId },
    'SET #s = :failed, errorMessage = :msg, completedAt = :now',
    { ':failed': 'failed', ':msg': message, ':now': now },
    { '#s': 'status' }
  ).catch((e) => console.error('[reelCheck] reel fail update failed', reel.reelId, e))

  if (reel.creditsCharged) {
    const refund = reel.source === 'MOMENTS' ? refundAiSearchCredits : refundReelCredits
    await refund(job.studioId, reel.creditsCharged).catch((e) => console.error('[reelCheck] refund failed', reel.reelId, e))
  }
}

// Checks one in-flight AI_REEL job/reel pair against the provider (Kling)
// right now and advances it if Kling has finished. Originally inlined
// directly in cron/reel-check's loop body; extracted (2026-09-30) so a
// user-triggered on-demand check (reels/[reelId]/check-now) can reuse the
// identical claim/finalize/refund logic instead of duplicating it — built
// after discovering production's reel-check periodic trigger was never
// actually wired to a real recurring schedule, leaving reels stuck on
// "generating" indefinitely with no way for a user to self-recover.
export async function checkAndAdvanceReelJob(job: StudioJob, reel: StudioReel | null | undefined): Promise<ReelCheckOutcome> {
  if (!reel || !reel.provider || !reel.providerJobIds?.length) return 'skipped'
  if (reel.status === 'completed' || reel.status === 'failed') return 'skipped'
  if (job.status !== 'PROCESSING') return 'skipped'

  let statuses
  try {
    statuses = await checkReelClipStatuses({ providerName: reel.provider, providerJobIds: reel.providerJobIds })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error('[reelCheck] status check threw for reel', reel.reelId, err)
    await studioUpdateItem(
      TABLES.jobs, { jobId: job.jobId },
      'SET outputPayload.lastCheckError = :err, updatedAt = :now',
      { ':err': errorMessage, ':now': new Date().toISOString() }
    ).catch((e) => console.error('[reelCheck] lastCheckError update failed', reel.reelId, e))
    return 'still-generating'
  }

  const values = reel.providerJobIds.map((id) => statuses[id])
  const anyFailed = values.some((s) => s?.status === 'failed')
  const allCompleted = values.every((s) => s?.status === 'completed')

  if (anyFailed) {
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
        console.error('[reelCheck] unexpected error claiming failed job for refund', job.jobId, err)
      }
      return 'skipped'
    }
    const firstError = values.find((s) => s?.status === 'failed')?.errorMessage
    await failAndRefund(job, reel, firstError || 'Clip generation failed')
    return 'failed'
  }

  if (!allCompleted) {
    const lastCheckError = values.find((s) => s?.errorMessage)?.errorMessage
    await studioUpdateItem(
      TABLES.jobs, { jobId: job.jobId },
      'SET outputPayload = :p, updatedAt = :now',
      { ':p': { stage: 'generating', processed: values.filter((s) => s?.status === 'completed').length, total: values.length, ...(lastCheckError ? { lastCheckError } : {}) }, ':now': new Date().toISOString() }
    ).catch((e) => console.error('[reelCheck] progress update failed', reel.reelId, e))
    return 'still-generating'
  }

  // Every clip succeeded — conditionally move PROCESSING -> FINALIZING before
  // invoking the Lambda's finalize path. The condition means a second,
  // overlapping check (e.g. the cron and a user's own "Check now" click
  // landing at the same moment) loses the race here and just skips,
  // rather than both invoking finalize for the same reel.
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
      console.error('[reelCheck] unexpected error claiming job for finalize', job.jobId, err)
    }
    return 'skipped'
  }

  await studioUpdateItem(
    TABLES.reels, { reelId: reel.reelId }, 'SET #s = :assembling',
    { ':assembling': 'assembling' }, { '#s': 'status' }
  ).catch((e) => console.error('[reelCheck] reel assembling update failed', reel.reelId, e))

  const clipUrls = reel.providerJobIds.map((id) => statuses[id]?.outputUrl).filter((u): u is string => !!u)
  if (clipUrls.length !== reel.providerJobIds.length) {
    await failAndRefund(job, reel, 'One or more completed clips had no output URL')
    return 'failed'
  }

  if (!process.env.REEL_LAMBDA_ARN) {
    console.error('[reelCheck] REEL_LAMBDA_ARN not set, cannot finalize', reel.reelId)
    await failAndRefund(job, reel, 'Could not finalize generation')
    return 'failed'
  }

  try {
    await lambda.send(new InvokeCommand({
      FunctionName: process.env.REEL_LAMBDA_ARN,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify({
        jobId: job.jobId, reelId: reel.reelId, studioId: job.studioId,
        mode: 'finalize',
        clipUrls,
        targetDimensions: (reel.mode === 'text' || reel.mode === 'omni') ? undefined : REEL_ASPECT_RATIO_DIMENSIONS[reel.aspectRatio as '9:16' | '4:5' | '16:9'],
        r2Bucket: process.env.STUDIO_R2_ORIGINAL_BUCKET,
        r2Endpoint: process.env.STUDIO_R2_ENDPOINT,
        r2AccessKeyId: process.env.STUDIO_R2_ORIGINAL_ACCESS_KEY_ID,
        r2SecretAccessKey: process.env.STUDIO_R2_ORIGINAL_SECRET_ACCESS_KEY,
        creditsCharged: reel.creditsCharged,
        refundPool: reel.source === 'MOMENTS' ? 'aiSearchCredits' : 'reelCredits',
      })),
    }))
    return 'advanced'
  } catch (err) {
    console.error('[reelCheck] finalize invoke failed', reel.reelId, err)
    await failAndRefund(job, reel, 'Could not finalize generation')
    return 'failed'
  }
}
