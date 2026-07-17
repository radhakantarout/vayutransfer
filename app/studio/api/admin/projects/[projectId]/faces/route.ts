import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand as DocQueryCommand } from '@aws-sdk/lib-dynamodb'
import type { StudioProject, StudioJob } from '@/types/studio'

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })
)

export async function GET(
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

    const project = await studioGetItem<StudioProject>(TABLES.projects, { studioId, projectId })
    if (!project) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    // Job status — latest active or completed job for this project. The
    // projectId-status-index GSI has no jobType in its key, so a PENDING/
    // PROCESSING job of a *different* type (e.g. a stale ZIP_DOWNLOAD job
    // that never got marked READY/FAILED) could otherwise be picked up as
    // this project's "active face-indexing job" — which made the frontend
    // poll forever, believing indexing was still running when it wasn't.
    // Fetch a small batch per status and filter to INDEX_FACES in code
    // instead of relying on Limit:1 alone.
    const [pendingJobs, processingJobs, readyJobs] = await Promise.all([
      studioQueryByIndex<StudioJob>(TABLES.jobs, 'projectId-status-index',
        'projectId = :pid AND #s = :s', { ':pid': projectId, ':s': 'PENDING' }, { '#s': 'status' }, 25),
      studioQueryByIndex<StudioJob>(TABLES.jobs, 'projectId-status-index',
        'projectId = :pid AND #s = :s', { ':pid': projectId, ':s': 'PROCESSING' }, { '#s': 'status' }, 25),
      studioQueryByIndex<StudioJob>(TABLES.jobs, 'projectId-status-index',
        'projectId = :pid AND #s = :s', { ':pid': projectId, ':s': 'READY' }, { '#s': 'status' }, 25),
    ])

    const activeJob = processingJobs.find(j => j.jobType === 'INDEX_FACES')
      ?? pendingJobs.find(j => j.jobType === 'INDEX_FACES')
      ?? null
    const lastReady = readyJobs
      .filter(j => j.jobType === 'INDEX_FACES')
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))[0] ?? null

    // Count unindexed photos — projectId is the table's own PK, no GSI needed
    const pendingRes = await ddb.send(new DocQueryCommand({
      TableName: TABLES.mediafiles,
      KeyConditionExpression: 'projectId = :pid',
      FilterExpression: 'processingStatus = :ready AND fileType = :img AND (attribute_not_exists(faceIndexed) OR faceIndexed = :false)',
      ExpressionAttributeValues: { ':pid': projectId, ':ready': 'READY', ':img': 'IMAGE', ':false': false },
      Select: 'COUNT',
    }))

    const totalPhotos   = project.totalFiles ?? 0
    const pendingPhotos = pendingRes.Count ?? 0
    const indexedPhotos = totalPhotos - pendingPhotos

    return NextResponse.json({
      success: true,
      data: {
        totalPhotos,
        indexedPhotos,
        pendingPhotos,
        activeJob: activeJob ? { jobId: activeJob.jobId, status: activeJob.status } : null,
        lastCompletedAt: lastReady?.completedAt ?? null,
      },
    })
  } catch (err) {
    console.error('[faces GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
