import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { REEL_ASPECT_RATIO_DIMENSIONS } from '@/constants/videoProviders'
import type { ReelAspectRatio } from '@/types/studio'

const lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

// Shared by the reel-reclaim quick-fix routes only (app/studio/api/cron/
// reel-check has its own, separately-tested copy of this same invoke shape —
// deliberately not refactored to share this helper, to avoid touching
// already-hardened, already-reviewed code for an unrelated feature).
export async function invokeReelFinalizeLambda(params: {
  jobId: string
  reelId: string
  studioId: string
  clipUrls: string[]
  aspectRatio: ReelAspectRatio
  mode?: 'photo' | 'text'
}): Promise<void> {
  if (!process.env.REEL_LAMBDA_ARN) {
    throw new Error('REEL_LAMBDA_ARN not set, cannot finalize')
  }
  // Enforced, not just documented — every current caller already excludes
  // mode:'text' before reaching here (reclaim is photo-mode-only, see
  // reel-reclaim-quick-fix plan), but a future second caller reusing this
  // helper without that same guard would otherwise silently mis-cast
  // targetDimensions below instead of failing loudly.
  if (params.mode === 'text') {
    throw new Error('invokeReelFinalizeLambda does not support mode:\'text\' — text-to-video reclaim needs its own design (see reel-reclaim-quick-fix plan)')
  }
  await lambda.send(new InvokeCommand({
    FunctionName: process.env.REEL_LAMBDA_ARN,
    InvocationType: 'Event',
    Payload: Buffer.from(JSON.stringify({
      jobId: params.jobId, reelId: params.reelId, studioId: params.studioId,
      mode: 'finalize',
      clipUrls: params.clipUrls,
      // Always photo-style (concat+crop) here — the guard above already
      // rejects mode:'text'. '1:1' only ever appears on mode:'text' reels
      // (see ReelAspectRatio in types/studio.ts), so the cast is safe.
      targetDimensions: REEL_ASPECT_RATIO_DIMENSIONS[params.aspectRatio as '9:16' | '4:5' | '16:9'],
      r2Bucket: process.env.STUDIO_R2_ORIGINAL_BUCKET,
      r2Endpoint: process.env.STUDIO_R2_ENDPOINT,
      r2AccessKeyId: process.env.STUDIO_R2_ORIGINAL_ACCESS_KEY_ID,
      r2SecretAccessKey: process.env.STUDIO_R2_ORIGINAL_SECRET_ACCESS_KEY,
      // No creditsCharged/refundPool — reclaim never deducts or refunds
      // credits (the original charge was already refunded when the old reel
      // was marked failed), so the Lambda's own catch-block refund call is a
      // deliberate no-op here (refundCredits early-returns when pool/credits
      // are falsy).
    })),
  }))
}
