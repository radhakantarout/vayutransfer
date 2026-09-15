import { NextRequest, NextResponse } from 'next/server'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioPutItem, studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import { accuracyToQualityFilter, DEFAULT_AI_ACCURACY } from '@/lib/studio/faceAccuracy'
import { syncBillingCycle, checkAiCreditsAvailable } from '@/lib/studio/quota'
import { resolveProjectForViewer, isOwnerOrAdmin } from '@/lib/studio/galleryMembers'
import type { Studio, StudioJob } from '@/types/studio'

const lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

// Mirrors admin/.../faces/index exactly — same credit-gate + job-dedupe
// pattern. Called automatically right after an upload batch finishes when
// the uploader left the AI-search toggle on (default), with the fileIds
// from that batch — never a blind "index everything" for Moments.
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId } = params
    const body = await req.json().catch(() => ({}))
    const fileIds: string[] | undefined = Array.isArray(body?.fileIds) && body.fileIds.length > 0 ? body.fileIds : undefined
    const qualityFilter = accuracyToQualityFilter(DEFAULT_AI_ACCURACY)

    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved || !isOwnerOrAdmin(auth.studioId, resolved.project, resolved.member)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    const studioId = resolved.project.studioId

    let studio = await studioGetItem<Studio>(TABLES.studios, { studioId })
    if (!studio?.featureFlags?.aiFaceRecognition) {
      return NextResponse.json({ success: false, error: 'FEATURE_DISABLED' }, { status: 403 })
    }

    studio = await syncBillingCycle(studio)
    const requestedCount = fileIds?.length ?? 1
    const aiQuota = checkAiCreditsAvailable(studio, requestedCount)
    if (!aiQuota.ok) {
      return NextResponse.json({
        success: false, error: 'QUOTA_EXCEEDED', quotaType: 'ai',
        message: 'You’re out of free AI search credits for this gallery.',
        usedCredits: aiQuota.usedCredits, quotaCredits: aiQuota.quotaCredits, usedPct: aiQuota.usedPct,
      }, { status: 402 })
    }

    const runningJobs = await studioQueryByIndex<StudioJob>(
      TABLES.jobs,
      'projectId-status-index',
      'projectId = :pid AND #s = :processing',
      { ':pid': projectId, ':processing': 'PROCESSING' },
      { '#s': 'status' },
      25
    )
    const runningIndexJob = runningJobs.find((j) => j.jobType === 'INDEX_FACES')
    if (runningIndexJob) {
      return NextResponse.json({
        success: false, error: 'JOB_RUNNING', data: { jobId: runningIndexJob.jobId },
      }, { status: 409 })
    }

    const jobId = crypto.randomUUID()
    const now   = new Date().toISOString()
    const ttl   = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60

    const job: StudioJob = {
      jobId, jobType: 'INDEX_FACES', status: 'PENDING',
      projectId, studioId,
      inputPayload: { triggeredBy: auth.userId, ...(fileIds ? { fileIds } : {}), qualityFilter },
      createdAt: now, ttl,
    }
    await studioPutItem(TABLES.jobs, job as unknown as Record<string, unknown>)

    if (process.env.INDEXFACES_LAMBDA_ARN) {
      lambda.send(new InvokeCommand({
        FunctionName: process.env.INDEXFACES_LAMBDA_ARN,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({ projectId, studioId, jobId, ...(fileIds ? { fileIds } : {}), qualityFilter })),
      })).catch((err: unknown) => console.error('[moments indexfaces invoke]', err))
    }

    return NextResponse.json({ success: true, data: { jobId, status: 'PENDING' } })
  } catch (err) {
    console.error('[moments faces/index POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
