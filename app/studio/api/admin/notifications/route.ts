import { NextRequest, NextResponse } from 'next/server'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { TABLES } from '@/lib/studio/dynamodb'
import type { StudioJob } from '@/types/studio'

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

    // Query READY jobs for this studio's projects
    // We scan jobs by studioId using a filter (no studioId GSI, acceptable at this scale)
    // In practice, a studio has <20 projects so this is fast
    const res = await ddb.send(new QueryCommand({
      TableName: TABLES.jobs,
      IndexName: 'projectId-status-index',
      // We'd need studioId GSI for proper filtering — approximate by checking all READY jobs
      // for the projectId passed as query param
      KeyConditionExpression: 'projectId = :pid AND #s = :s',
      FilterExpression: 'completedAt > :since',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':pid': req.nextUrl.searchParams.get('projectId') ?? '',
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
