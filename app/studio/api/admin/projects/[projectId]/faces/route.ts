import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import { QueryCommand } from '@aws-sdk/client-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand as DocQueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import type { StudioProject, StudioFace, StudioJob, MediaFile } from '@/types/studio'

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

    // Faces — sorted by photoCount DESC in app layer
    const facesRes = await ddb.send(new DocQueryCommand({
      TableName: TABLES.faces,
      KeyConditionExpression: 'projectId = :pid',
      FilterExpression: 'photoCount >= :min',
      ExpressionAttributeValues: { ':pid': projectId, ':min': 3 },
      Limit: 100,
    }))
    const faces = (facesRes.Items as StudioFace[] ?? [])
      .sort((a, b) => (b.photoCount ?? 0) - (a.photoCount ?? 0))

    // Job status — latest job for this project
    const [pendingJobs, processingJobs, readyJobs] = await Promise.all([
      studioQueryByIndex<StudioJob>(TABLES.jobs, 'projectId-status-index',
        'projectId = :pid AND #s = :s', { ':pid': projectId, ':s': 'PENDING' }, { '#s': 'status' }, 1),
      studioQueryByIndex<StudioJob>(TABLES.jobs, 'projectId-status-index',
        'projectId = :pid AND #s = :s', { ':pid': projectId, ':s': 'PROCESSING' }, { '#s': 'status' }, 1),
      studioQueryByIndex<StudioJob>(TABLES.jobs, 'projectId-status-index',
        'projectId = :pid AND #s = :s', { ':pid': projectId, ':s': 'READY' }, { '#s': 'status' }, 1),
    ])

    const activeJob = processingJobs[0] ?? pendingJobs[0] ?? null
    const lastReady = readyJobs[0] ?? null

    // Count unindexed photos — projectId is the table's own PK, no GSI needed
    const pendingRes = await ddb.send(new DocQueryCommand({
      TableName: TABLES.mediafiles,
      KeyConditionExpression: 'projectId = :pid',
      FilterExpression: 'processingStatus = :ready AND fileType = :img AND (attribute_not_exists(faceIndexed) OR faceIndexed = :false)',
      ExpressionAttributeValues: { ':pid': projectId, ':ready': 'READY', ':img': 'IMAGE', ':false': false },
      Select: 'COUNT',
    }))

    // Fetch preview URLs for each face (first 6 photos)
    const facesWithPreviews = await Promise.all(faces.map(async face => {
      const previewIds = [...(face.photoIds ?? [])].slice(0, 6)
      if (!previewIds.length) return { ...face, previewUrls: [] }

      const batchRes = await ddb.send(new BatchGetCommand({
        RequestItems: {
          [TABLES.mediafiles]: {
            Keys: previewIds.map(fid => ({ projectId, fileId: fid })),
            ProjectionExpression: 'fileId, r2PreviewUrl',
          },
        },
      }))
      const files = (batchRes.Responses?.[TABLES.mediafiles] ?? []) as Pick<MediaFile, 'fileId' | 'r2PreviewUrl'>[]
      return { ...face, previewUrls: files.map(f => f.r2PreviewUrl).filter(Boolean) }
    }))

    return NextResponse.json({
      success: true,
      data: {
        totalFaces: faces.length,
        pendingPhotos: pendingRes.Count ?? 0,
        indexedPhotos: (project.totalFiles ?? 0) - (pendingRes.Count ?? 0),
        activeJob: activeJob ? { jobId: activeJob.jobId, status: activeJob.status } : null,
        lastCompletedAt: lastReady?.completedAt ?? null,
        faces: facesWithPreviews,
      },
    })
  } catch (err) {
    console.error('[faces GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
