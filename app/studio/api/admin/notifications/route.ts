import { NextRequest, NextResponse } from 'next/server'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioJob, StudioProject } from '@/types/studio'

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })
)

// Returns jobs that completed in the last 24h (for notification bell)
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const studioId = auth.studioId!
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const projectId = req.nextUrl.searchParams.get('projectId') ?? ''

    const project = await studioGetItem<StudioProject>(TABLES.projects, { studioId, projectId })
    if (!project) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    // Query READY jobs for this project (ownership verified above)
    const res = await ddb.send(new QueryCommand({
      TableName: TABLES.jobs,
      IndexName: 'projectId-status-index',
      KeyConditionExpression: 'projectId = :pid AND #s = :s',
      FilterExpression: 'completedAt > :since',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':pid': projectId,
        ':s': 'READY',
        ':since': since,
      },
      Limit: 5,
    }))

    const jobs = (res.Items ?? []) as StudioJob[]
    return NextResponse.json({
      success: true,
      data: { notifications: jobs.map(j => ({ jobId: j.jobId, jobType: j.jobType, projectId: j.projectId, completedAt: j.completedAt })) },
    })
  } catch (err) {
    console.error('[notifications GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
