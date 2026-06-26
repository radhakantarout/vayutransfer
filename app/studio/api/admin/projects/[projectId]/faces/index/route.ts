import { NextRequest, NextResponse } from 'next/server'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioPutItem, studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import type { Studio, StudioProject, StudioJob } from '@/types/studio'

const lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId } = params
    const studioId = auth.studioId!

    const [studio, project] = await Promise.all([
      studioGetItem<Studio>(TABLES.studios, { studioId }),
      studioGetItem<StudioProject>(TABLES.projects, { studioId, projectId }),
    ])

    if (!project) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    if (!studio?.featureFlags?.aiFaceRecognition) {
      return NextResponse.json({
        success: false, error: 'FEATURE_DISABLED',
        message: 'AI Face Recognition is not enabled on your plan',
      }, { status: 403 })
    }

    // Check if a job is already running for this project
    const runningJobs = await studioQueryByIndex<StudioJob>(
      TABLES.jobs,
      'projectId-status-index',
      'projectId = :pid AND #s = :processing',
      { ':pid': projectId, ':processing': 'PROCESSING' },
      { '#s': 'status' },
      1
    )
    if (runningJobs.length > 0) {
      return NextResponse.json({
        success: false, error: 'JOB_RUNNING',
        message: 'Face indexing is already in progress',
        data: { jobId: runningJobs[0].jobId },
      }, { status: 409 })
    }

    const jobId  = crypto.randomUUID()
    const now    = new Date().toISOString()
    const ttl    = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 // 7 days

    const job: StudioJob = {
      jobId, jobType: 'INDEX_FACES', status: 'PENDING',
      projectId, studioId,
      inputPayload: { triggeredBy: auth.userId },
      createdAt: now, ttl,
    }
    await studioPutItem(TABLES.jobs, job as unknown as Record<string, unknown>)

    // Invoke Lambda async
    if (process.env.INDEXFACES_LAMBDA_ARN) {
      lambda.send(new InvokeCommand({
        FunctionName: process.env.INDEXFACES_LAMBDA_ARN,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({ projectId, studioId, jobId })),
      })).catch((err: unknown) => console.error('[indexfaces invoke]', err))
    } else {
      console.warn('[indexfaces] INDEXFACES_LAMBDA_ARN not set — job created but Lambda not invoked')
    }

    return NextResponse.json({ success: true, data: { jobId, status: 'PENDING' } })
  } catch (err) {
    console.error('[faces/index POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
