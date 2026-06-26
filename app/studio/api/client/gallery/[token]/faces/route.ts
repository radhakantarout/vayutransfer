import { NextRequest, NextResponse } from 'next/server'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject, Studio, StudioFace } from '@/types/studio'

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })
)

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'CLIENT') {
      return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 })
    }

    const { token } = params

    const projects = await studioQueryByIndex<StudioProject>(
      TABLES.projects, 'clientShareToken-index',
      'clientShareToken = :token', { ':token': token }
    )
    const project = projects[0]
    if (!project) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    if (!project.clientShareExpiresAt || new Date(project.clientShareExpiresAt) < new Date()) {
      return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
    }
    if (auth.projectId !== project.projectId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    // Check studio feature flag
    const studio = await studioGetItem<Studio>(TABLES.studios, { studioId: project.studioId })
    if (!studio?.featureFlags?.aiFaceRecognition) {
      return NextResponse.json({ success: false, error: 'FEATURE_DISABLED' }, { status: 403 })
    }

    const facesRes = await ddb.send(new QueryCommand({
      TableName: TABLES.faces,
      KeyConditionExpression: 'projectId = :pid',
      FilterExpression: 'photoCount >= :min',
      ExpressionAttributeValues: { ':pid': project.projectId, ':min': 3 },
      Limit: 50,
    }))

    const faces = ((facesRes.Items ?? []) as StudioFace[])
      .sort((a, b) => (b.photoCount ?? 0) - (a.photoCount ?? 0))
      .map(f => ({
        faceId: f.faceId,
        thumbnailUrl: f.thumbnailUrl,
        photoCount: f.photoCount,
        label: f.label ?? null,
      }))

    return NextResponse.json({ success: true, data: { faces } })
  } catch (err) {
    console.error('[client/faces GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
